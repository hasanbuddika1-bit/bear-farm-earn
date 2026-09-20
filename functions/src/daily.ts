import { onCall } from "firebase-functions/v2/https";
import {
  HttpsError,
  col,
  db,
  enforceAppCheck,
  nowMs,
  rateLimit,
  requireActiveUser,
  requireAuth,
  requireIdempotencyKey,
  sanitizeString,
} from "./lib/init";
import { getConfig, nextStreak, utcDayKey } from "./lib/config";
import { award } from "./lib/ledger";

/** Daily reward — one claim per UTC day, streak resets after a missed day. */
export const claimDaily = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "claimDaily", 15, 60_000);
  const idempotencyKey = requireIdempotencyKey(
    (req.data as Record<string, unknown>)?.["idempotencyKey"],
  );
  const config = await getConfig();
  const today = utcDayKey();

  const { streak, amount } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(col.user(uid));
    const daily = (snap.data()?.["daily"] ?? {}) as Record<string, unknown>;
    const last = (daily["lastClaimDay"] as string | null) ?? null;
    const current = Number(daily["streak"] ?? 0);
    const next = nextStreak(last, current, today, config.dailyRewards.length);
    if (next === null) {
      throw new HttpsError("failed-precondition", "Today's reward is already claimed.");
    }
    const reward = config.dailyRewards[next - 1] ?? config.dailyRewards[0]!;
    tx.update(col.user(uid), {
      daily: { streak: next, lastClaimDay: today },
      updatedAt: nowMs(),
    });
    return { streak: next, amount: reward };
  });

  const result = await award({
    uid,
    type: "daily",
    label: `Daily reward · day ${streak}`,
    amount,
    idempotencyKey,
  });
  return { ...result, streak };
});

/** Reward codes are validated here; the code list is never shipped to the client. */
export const claimRewardCode = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "claimRewardCode", 8, 60_000);
  const raw = sanitizeString((req.data as Record<string, unknown>)?.["code"], 40);
  const code = raw.toUpperCase();

  const amount = await db.runTransaction(async (tx) => {
    const ref = col.codes().doc(code);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "This reward code is not valid.");
    const data = snap.data() ?? {};
    if (data["active"] !== true) throw new HttpsError("failed-precondition", "This code is closed.");
    const expiresAt = Number(data["expiresAt"] ?? 0);
    if (expiresAt && expiresAt < nowMs()) {
      throw new HttpsError("failed-precondition", "This code has expired.");
    }
    const used = Number(data["usedCount"] ?? 0);
    const maxUses = Number(data["maxUses"] ?? 0);
    if (maxUses && used >= maxUses) {
      throw new HttpsError("resource-exhausted", "This code reached its limit.");
    }
    const claimRef = ref.collection("claims").doc(uid);
    if ((await tx.get(claimRef)).exists) {
      throw new HttpsError("already-exists", "You already used this code.");
    }
    tx.set(claimRef, { uid, createdAt: nowMs() });
    tx.update(ref, { usedCount: used + 1 });
    return Number(data["reward"] ?? 0);
  });

  return award({
    uid,
    type: "code",
    label: `Reward code ${code}`,
    amount,
    idempotencyKey: `code_${code}`,
  });
});
