import { onCall } from "firebase-functions/v2/https";
import {
  ADMIN_TELEGRAM_ID,
  FieldValue,
  HttpsError,
  TELEGRAM_BOT_TOKEN,
  auth,
  col,
  db,
  enforceAppCheck,
  nowMs,
  publicName,
  rateLimit,
  requireAuth,
  sanitizeString,
} from "./lib/init";
import { getConfig, publicConfig } from "./lib/config";
import { miniAppButton, sendMessage, verifyInitData } from "./lib/telegram";

const BANNER =
  "https://raw.githubusercontent.com/bearfarm-assets/main/banner.png"; // replaced by config.bannerUrl when set

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 7; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function clientIp(raw: { headers: Record<string, unknown>; ip?: string }) {
  const forwarded = raw.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0]!.trim();
  }
  return raw.ip ?? "unknown";
}

/**
 * The only entry point into the system. Telegram initData is verified with the bot
 * token; a Firebase custom token is only minted after that signature passes.
 */
export const telegramAuth = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN], enforceAppCheck, cors: true, maxInstances: 20 },
  async (req) => {
    const data = (req.data ?? {}) as Record<string, unknown>;
    const initData = sanitizeString(data["initData"], 4096);
    const deviceId = sanitizeString(data["deviceId"], 100);
    const startParam =
      typeof data["startParam"] === "string" ? data["startParam"].slice(0, 40) : null;

    const tgUser = verifyInitData(initData, TELEGRAM_BOT_TOKEN.value());
    const uid = `tg_${tgUser.id}`;
    const ip = clientIp(req.rawRequest as never);
    const config = await getConfig();
    const adminId = Number(ADMIN_TELEGRAM_ID.value());

    const existing = await col.user(uid).get();
    let isNewUser = false;

    if (!existing.exists) {
      isNewUser = true;
      // Same device or IP may only farm on the first account; the rest are suspended.
      const deviceRef = col.devices().doc(deviceId);
      const [deviceSnap, ipSnap] = await Promise.all([
        deviceRef.get(),
        col.devices().where("ip", "==", ip).limit(1).get(),
      ]);
      const deviceOwner = deviceSnap.exists ? (deviceSnap.data()?.["uid"] as string) : null;
      const ipOwner = ipSnap.empty ? null : (ipSnap.docs[0]!.data()["uid"] as string);
      const duplicate = (deviceOwner && deviceOwner !== uid) || (ipOwner && ipOwner !== uid);

      let referredBy: number | null = null;
      if (startParam) {
        const refSnap = await col.users().where("referralCode", "==", startParam).limit(1).get();
        if (!refSnap.empty) {
          const inviter = refSnap.docs[0]!;
          const inviterTgId = inviter.data()["telegramId"] as number;
          // Self referral and loops are rejected outright.
          if (inviterTgId !== tgUser.id) referredBy = inviterTgId;
        }
      }

      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(col.user(uid));
        if (fresh.exists) return;
        tx.set(col.user(uid), {
          telegramId: tgUser.id,
          username: tgUser.username,
          firstName: tgUser.firstName,
          lastName: tgUser.lastName,
          photoUrl: tgUser.photoUrl,
          balance: 0,
          totalEarned: 0,
          withdrawalCount: 0,
          suspended: Boolean(duplicate),
          suspendedReason: duplicate
            ? "Multiple accounts were detected from the same device or network."
            : null,
          walletAddress: null,
          referralCode: randomCode(),
          referredBy,
          referralCount: 0,
          activeReferralCount: 0,
          referralPendingReward: 0,
          referralTotalEarned: 0,
          adsWatchedTotal: 0,
          language: "en",
          notificationsEnabled: true,
          mining: { active: false, startedAt: null, endsAt: null, claimable: false },
          daily: { streak: 0, lastClaimDay: null },
          deviceId,
          ip,
          createdAt: nowMs(),
          updatedAt: nowMs(),
        });
        tx.set(deviceRef, { uid, ip, createdAt: nowMs() }, { merge: true });
        tx.set(col.stats(), { users: FieldValue.increment(1) }, { merge: true });
      });

      if (referredBy && !duplicate) {
        await col.referrals().doc(`${referredBy}_${tgUser.id}`).set({
          inviterTelegramId: referredBy,
          inviteeTelegramId: tgUser.id,
          inviteeUid: uid,
          name: publicName(tgUser as never),
          stage: "pending",
          earned: 0,
          adsWatched: 0,
          joinRewarded: false,
          stage1Rewarded: false,
          stage2Rewarded: false,
          ip,
          deviceId,
          createdAt: nowMs(),
        });
      }

      const token = TELEGRAM_BOT_TOKEN.value();
      await sendMessage(
        token,
        tgUser.id,
        `🐻 <b>Welcome to Bear Farm!</b>\n\n🌾 Mine ${config.miningRewardPerCycle} ${config.tokenSymbol} every ${config.miningCycleMinutes} minutes\n✅ Finish tasks, 👥 refer friends\n💵 Withdraw real USDT (BEP-20)`,
        [
          ...miniAppButton(config.botUsername),
          [
            { text: "📣 Community", url: config.communityChannelUrl },
            { text: "💸 Payouts", url: config.paymentChannelUrl },
          ],
        ],
        BANNER,
      );
      await sendMessage(
        token,
        adminId,
        `🆕 <b>New farmer joined</b>\n👤 ${publicName(tgUser as never)}\n🆔 <code>${tgUser.id}</code>${duplicate ? "\n⚠️ Auto-suspended: duplicate device/IP" : ""}`,
      );
    } else {
      await col.user(uid).set(
        {
          username: tgUser.username,
          firstName: tgUser.firstName,
          lastName: tgUser.lastName,
          photoUrl: tgUser.photoUrl,
          lastSeenAt: nowMs(),
          lastIp: ip,
        },
        { merge: true },
      );
    }

    const token = await auth.createCustomToken(uid, {
      telegramId: tgUser.id,
      admin: tgUser.id === adminId,
    });
    void publicConfig;
    return { token, isNewUser };
  },
);

/** Server time + the public part of the config. No secrets leave the backend. */
export const bootstrap = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await rateLimit(uid, "bootstrap", 60, 60_000);
  const config = await getConfig();
  const adminId = Number(ADMIN_TELEGRAM_ID.value());
  const snap = await col.user(uid).get();
  if (!snap.exists) throw new HttpsError("not-found", "Account not found.");
  const telegramId = snap.data()?.["telegramId"] as number;
  if (telegramId === adminId && snap.data()?.["isAdmin"] !== true) {
    await col.user(uid).set({ isAdmin: true }, { merge: true });
  }
  return { config: publicConfig(config), serverTime: nowMs() };
});
