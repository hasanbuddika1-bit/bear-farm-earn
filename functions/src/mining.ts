import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
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

/** Mining windows are created and timed by the server only. */
export const startMining = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "startMining", 10, 60_000);
  const config = await getConfig();
  if (config.maintenance) throw new HttpsError("unavailable", "Bear Farm is under maintenance.");

  const endsAt = await db.runTransaction(async (tx) => {
    const snap = await tx.get(col.user(uid));
    const mining = (snap.data()?.["mining"] ?? {}) as Record<string, unknown>;
    if (mining["active"] === true && Number(mining["endsAt"] ?? 0) > nowMs()) {
      throw new HttpsError("failed-precondition", "Mining is already running.");
    }
    if (mining["claimable"] === true) {
      throw new HttpsError("failed-precondition", "Claim your last mining reward first.");
    }
    const ends = nowMs() + config.miningCycleMinutes * 60_000;
    tx.update(col.user(uid), {
      mining: {
        active: true,
        startedAt: nowMs(),
        endsAt: ends,
        claimable: false,
        reward: config.miningRewardPerCycle,
        notified: false,
      },
      updatedAt: nowMs(),
    });
    return ends;
  });

  return { endsAt };
});

/** Reward is computed from the stored window — a client clock cannot shorten it. */
export const claimMining = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "claimMining", 20, 60_000);
  const idempotencyKey = requireIdempotencyKey((req.data as Record<string, unknown>)?.["idempotencyKey"]);

  const reward = await db.runTransaction(async (tx) => {
    const snap = await tx.get(col.user(uid));
    const mining = (snap.data()?.["mining"] ?? {}) as Record<string, unknown>;
    const endsAt = Number(mining["endsAt"] ?? 0);
    if (mining["active"] !== true || !endsAt) {
      throw new HttpsError("failed-precondition", "No mining session to claim.");
    }
    if (endsAt > nowMs()) throw new HttpsError("failed-precondition", "Mining is not finished yet.");
    const amount = Number(mining["reward"] ?? 0);
    if (amount <= 0) throw new HttpsError("failed-precondition", "Nothing to claim.");
    tx.update(col.user(uid), {
      mining: { active: false, startedAt: null, endsAt: null, claimable: false },
      updatedAt: nowMs(),
    });
    return amount;
  });

  return award({
    uid,
    type: "mining",
    label: "Mining reward",
    amount: reward,
    idempotencyKey,
  });
});

/** Marks finished sessions claimable and pings the farmer through the bot. */
export const miningWatcher = onSchedule(
  { schedule: "every 2 minutes", secrets: [TELEGRAM_BOT_TOKEN], timeoutSeconds: 300 },
  async () => {
    const config = await getConfig();
    const snap = await col
      .users()
      .where("mining.active", "==", true)
      .where("mining.endsAt", "<=", nowMs())
      .limit(300)
      .get();

    for (const doc of snap.docs) {
      const user = doc.data();
      const mining = (user["mining"] ?? {}) as Record<string, unknown>;
      if (mining["notified"] === true) continue;
      await doc.ref.set({ mining: { ...mining, claimable: true, notified: true } }, { merge: true });
      if (user["notificationsEnabled"] === false) continue;
      await sendMessage(
        TELEGRAM_BOT_TOKEN.value(),
        user["telegramId"] as number,
        `⛏️ <b>Mining complete!</b>\n\n🌾 ${mining["reward"] ?? config.miningRewardPerCycle} ${config.tokenSymbol} is ready to claim.\nTap below, claim it and start the next round.`,
        miniAppButton(config.botUsername),
      );
    }
  },
);
