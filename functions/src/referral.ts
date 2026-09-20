import { onCall, onRequest } from "firebase-functions/v2/https";
import { createHmac, timingSafeEqual } from "crypto";
import {
  ADS_CALLBACK_SECRET,
  FieldValue,
  HttpsError,
  TELEGRAM_BOT_TOKEN,
  col,
  db,
  enforceAppCheck,
  nowMs,
  rateLimit,
  requireActiveUser,
  requireAuth,
  requireIdempotencyKey,
} from "./lib/init";
import { getConfig } from "./lib/config";
import { award } from "./lib/ledger";
import { miniAppButton, sendMessage } from "./lib/telegram";

export const listReferrals = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  const user = await requireActiveUser(uid);
  await rateLimit(uid, "listReferrals", 60, 60_000);
  const cursor = (req.data as Record<string, unknown>)?.["cursor"];

  let q = col
    .referrals()
    .where("inviterTelegramId", "==", user["telegramId"])
    .orderBy("createdAt", "desc")
    .limit(20);
  if (typeof cursor === "string" && cursor) q = q.startAfter(Number(cursor));
  const snap = await q.get();

  const rows = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: (data["name"] as string) ?? "Farmer",
      stage: (data["stage"] as string) ?? "pending",
      earned: Number(data["earned"] ?? 0),
      adsWatched: Number(data["adsWatched"] ?? 0),
      createdAt: Number(data["createdAt"] ?? 0),
    };
  });
  const last = snap.docs.at(-1);
  return {
    rows,
    nextCursor: snap.size === 20 && last ? String(last.data()["createdAt"]) : null,
  };
});

/** Moves already-verified referral rewards from the pending pot into the balance. */
export const claimReferralEarnings = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "claimReferralEarnings", 10, 60_000);
  const idempotencyKey = requireIdempotencyKey(
    (req.data as Record<string, unknown>)?.["idempotencyKey"],
  );

  const amount = await db.runTransaction(async (tx) => {
    const snap = await tx.get(col.user(uid));
    const pending = Number(snap.data()?.["referralPendingReward"] ?? 0);
    if (pending <= 0) throw new HttpsError("failed-precondition", "Nothing to claim yet.");
    tx.update(col.user(uid), {
      referralPendingReward: 0,
      referralTotalEarned: FieldValue.increment(pending),
      updatedAt: nowMs(),
    });
    return pending;
  });

  const result = await award({
    uid,
    type: "referral",
    label: "Referral rewards",
    amount,
    idempotencyKey,
  });
  return { awarded: result.awarded };
});

/**
 * Credits the inviter's pending pot and tells the friend how far they are.
 * Called only from trusted server paths (ads callback, join).
 */
export async function progressReferral(inviteeTelegramId: number, adsWatchedTotal: number) {
  const config = await getConfig();
  const snap = await col
    .referrals()
    .where("inviteeTelegramId", "==", inviteeTelegramId)
    .limit(1)
    .get();
  if (snap.empty) return;
  const doc = snap.docs[0]!;
  const data = doc.data();
  if (data["stage"] === "fake") return;

  const inviterUid = `tg_${data["inviterTelegramId"]}`;
  const inviteeUid = data["inviteeUid"] as string;
  const inviteeSnap = await col.user(inviteeUid).get();
  if (inviteeSnap.data()?.["suspended"] === true) {
    await doc.ref.set({ stage: "fake", note: "Suspended account" }, { merge: true });
    return;
  }

  const updates: Record<string, unknown> = { adsWatched: adsWatchedTotal };
  let credit = 0;
  let stage = (data["stage"] as string) ?? "pending";

  if (data["joinRewarded"] !== true) {
    credit += config.referralJoinReward;
    updates["joinRewarded"] = true;
  }
  if (data["stage1Rewarded"] !== true && adsWatchedTotal >= config.referralStage1Ads) {
    credit += config.referralStage1Reward;
    updates["stage1Rewarded"] = true;
    stage = "half";
  }
  if (data["stage2Rewarded"] !== true && adsWatchedTotal >= config.referralStage2Ads) {
    credit += config.referralStage2Reward;
    updates["stage2Rewarded"] = true;
    stage = "verified";
  }
  updates["stage"] = stage;
  if (credit > 0) updates["earned"] = FieldValue.increment(credit);

  await doc.ref.set(updates, { merge: true });
  if (credit > 0) {
    await col.user(inviterUid).set(
      {
        referralPendingReward: FieldValue.increment(credit),
        referralCount: data["joinRewarded"] === true ? FieldValue.increment(0) : FieldValue.increment(1),
        activeReferralCount: stage === "verified" ? FieldValue.increment(1) : FieldValue.increment(0),
        updatedAt: nowMs(),
      },
      { merge: true },
    );
    const token = TELEGRAM_BOT_TOKEN.value();
    await sendMessage(
      token,
      data["inviterTelegramId"] as number,
      `👥 <b>Referral progress!</b>\n\n🌾 +${credit} ${config.tokenSymbol} added to your referral rewards (${stage}).\nOpen the app to claim it.`,
      miniAppButton(config.botUsername),
    );
    await sendMessage(
      token,
      inviteeTelegramId,
      stage === "verified"
        ? `✅ <b>You are fully verified!</b>\n\nKeep farming — every task and ad adds up.`
        : `🎬 <b>Keep going!</b>\n\nWatch ${Math.max(0, config.referralStage2Ads - adsWatchedTotal)} more ads to be fully verified.`,
      miniAppButton(config.botUsername),
    );
  }
}

/**
 * Ad reward webhook. Rewards exist only when the ad provider confirms the view —
 * a browser timer is never enough. Signature is verified before anything is written.
 */
export const adsReward = onRequest(
  { secrets: [ADS_CALLBACK_SECRET, TELEGRAM_BOT_TOKEN], cors: false },
  async (req, res) => {
    if (req.method !== "POST" && req.method !== "GET") {
      res.status(405).send("method not allowed");
      return;
    }
    const secret = ADS_CALLBACK_SECRET.value();
    const provided = String(req.query["sig"] ?? req.header("x-signature") ?? "");
    const payload = `${req.query["userid"] ?? ""}:${req.query["impression_id"] ?? ""}`;
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(provided.padEnd(expected.length, "0").slice(0, expected.length));
    const b = Buffer.from(expected);
    if (!provided || !timingSafeEqual(a, b)) {
      res.status(401).send("invalid signature");
      return;
    }

    const telegramId = Number(req.query["userid"]);
    const impressionId = String(req.query["impression_id"] ?? "");
    if (!Number.isInteger(telegramId) || !impressionId) {
      res.status(400).send("bad request");
      return;
    }

    const uid = `tg_${telegramId}`;
    const viewRef = col.adViews().doc(`${uid}_${impressionId}`);
    const fresh = await db.runTransaction(async (tx) => {
      if ((await tx.get(viewRef)).exists) return false;
      tx.set(viewRef, { uid, telegramId, impressionId, createdAt: nowMs() });
      return true;
    });
    if (!fresh) {
      res.status(200).send("duplicate ignored");
      return;
    }

    const config = await getConfig();
    const userSnap = await col.user(uid).get();
    if (!userSnap.exists || userSnap.data()?.["suspended"] === true) {
      res.status(200).send("ignored");
      return;
    }
    const adsWatchedTotal = Number(userSnap.data()?.["adsWatchedTotal"] ?? 0) + 1;
    await col.user(uid).set({ adsWatchedTotal, updatedAt: nowMs() }, { merge: true });

    const reward = Number(config.dailyTaskCommunityReward > 0 ? 10 : 10);
    await award({
      uid,
      type: "ads",
      label: "Ad reward",
      amount: reward,
      idempotencyKey: `ad_${impressionId}`,
    });
    await progressReferral(telegramId, adsWatchedTotal);
    res.status(200).send("ok");
  },
);
