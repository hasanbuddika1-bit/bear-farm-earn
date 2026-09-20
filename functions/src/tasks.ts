import { onCall } from "firebase-functions/v2/https";
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
  sanitizeString,
} from "./lib/init";
import { getConfig, utcDayKey } from "./lib/config";
import { award } from "./lib/ledger";
import { isChatMember } from "./lib/telegram";

const WAIT_SECONDS = 5;

export const listTasks = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "listTasks", 60, 60_000);
  const config = await getConfig();
  const today = utcDayKey();

  const [taskSnap, claimSnap, dailySnap] = await Promise.all([
    col.tasks().where("active", "==", true).limit(200).get(),
    col.taskClaims(uid).limit(500).get(),
    col.user(uid).collection("dailyTasks").doc(today).get(),
  ]);
  const claimed = new Set(claimSnap.docs.map((d) => d.id));
  const dailyClaims = (dailySnap.data() ?? {}) as Record<string, unknown>;

  const rows = taskSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      group: (data["group"] as string) ?? "main",
      kind: (data["kind"] as string) ?? "link",
      title: (data["title"] as string) ?? "Task",
      description: (data["description"] as string) ?? "",
      url: (data["url"] as string) ?? "",
      reward: Number(data["reward"] ?? 0),
      active: true,
      claimed: claimed.has(doc.id),
    };
  });

  const daily = [
    {
      id: "community",
      group: "main" as const,
      kind: "telegram_channel" as const,
      title: "Join the community channel",
      description: "Stay with the herd for news and codes.",
      url: config.communityChannelUrl,
      reward: config.dailyTaskCommunityReward,
      active: true,
      claimed: dailyClaims["community"] === true,
    },
    {
      id: "payment",
      group: "main" as const,
      kind: "telegram_channel" as const,
      title: "Join the payouts channel",
      description: "See every payout we send.",
      url: config.paymentChannelUrl,
      reward: config.dailyTaskPaymentReward,
      active: true,
      claimed: dailyClaims["payment"] === true,
    },
    {
      id: "referral",
      group: "main" as const,
      kind: "link" as const,
      title: "Invite 1 friend today",
      description: "Bring one new farmer to earn the daily bonus.",
      url: `${config.referralLink}`,
      reward: config.dailyReferralTaskReward,
      active: true,
      claimed: dailyClaims["referral"] === true,
    },
  ];

  return {
    daily,
    main: rows.filter((r) => r.group === "main"),
    partner: rows.filter((r) => r.group === "partner"),
  };
});

/** Starts a server-timed window; the claim is rejected before it elapses. */
export const startTaskSession = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "startTaskSession", 60, 60_000);
  const taskId = sanitizeString((req.data as Record<string, unknown>)?.["taskId"], 80);
  const task = await col.tasks().doc(taskId).get();
  if (!task.exists || task.data()?.["active"] !== true) {
    throw new HttpsError("not-found", "This task is no longer available.");
  }
  if ((await col.taskClaims(uid).doc(taskId).get()).exists) {
    throw new HttpsError("already-exists", "Task already claimed.");
  }
  const ref = col.taskSessions().doc();
  await ref.set({ uid, taskId, startedAt: nowMs(), used: false });
  return { sessionId: ref.id, waitSeconds: WAIT_SECONDS };
});

export const claimTask = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN], enforceAppCheck, cors: true },
  async (req) => {
    const uid = requireAuth(req);
    const user = await requireActiveUser(uid);
    await rateLimit(uid, "claimTask", 40, 60_000);
    const data = (req.data ?? {}) as Record<string, unknown>;
    const taskId = sanitizeString(data["taskId"], 80);
    const sessionId = typeof data["sessionId"] === "string" ? data["sessionId"] : null;

    const taskSnap = await col.tasks().doc(taskId).get();
    if (!taskSnap.exists || taskSnap.data()?.["active"] !== true) {
      throw new HttpsError("not-found", "This task is no longer available.");
    }
    const task = taskSnap.data()!;
    const reward = Number(task["reward"] ?? 0);

    if (task["kind"] === "telegram_channel") {
      const chatId = (task["chatId"] as string) ?? "";
      if (!chatId) throw new HttpsError("failed-precondition", "Task is misconfigured.");
      const joined = await isChatMember(
        TELEGRAM_BOT_TOKEN.value(),
        chatId,
        user["telegramId"] as number,
      );
      if (!joined) throw new HttpsError("failed-precondition", "Join the channel first, then claim.");
    } else {
      if (!sessionId) throw new HttpsError("failed-precondition", "Open the task link first.");
      await db.runTransaction(async (tx) => {
        const ref = col.taskSessions().doc(sessionId);
        const snap = await tx.get(ref);
        const session = snap.data();
        if (!snap.exists || session?.["uid"] !== uid || session?.["taskId"] !== taskId) {
          throw new HttpsError("permission-denied", "Task session is invalid.");
        }
        if (session["used"] === true) throw new HttpsError("already-exists", "Session already used.");
        if (nowMs() - Number(session["startedAt"] ?? 0) < WAIT_SECONDS * 1000) {
          throw new HttpsError("failed-precondition", "Keep the task open a little longer.");
        }
        tx.update(ref, { used: true, usedAt: nowMs() });
      });
    }

    await db.runTransaction(async (tx) => {
      const ref = col.taskClaims(uid).doc(taskId);
      if ((await tx.get(ref)).exists) {
        throw new HttpsError("already-exists", "Task already claimed.");
      }
      tx.set(ref, { taskId, reward, createdAt: nowMs() });
    });

    return award({
      uid,
      type: "task",
      label: (task["title"] as string) ?? "Task reward",
      amount: reward,
      idempotencyKey: `task_${taskId}`,
    });
  },
);

/** Daily tasks: channel membership and today's referral count are both checked server side. */
export const claimDailyTask = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN], enforceAppCheck, cors: true },
  async (req) => {
    const uid = requireAuth(req);
    const user = await requireActiveUser(uid);
    await rateLimit(uid, "claimDailyTask", 30, 60_000);
    const key = sanitizeString((req.data as Record<string, unknown>)?.["key"], 20);
    if (!["community", "payment", "referral"].includes(key)) {
      throw new HttpsError("invalid-argument", "Unknown daily task.");
    }
    const config = await getConfig();
    const today = utcDayKey();
    const telegramId = user["telegramId"] as number;

    let amount = 0;
    if (key === "community") {
      amount = config.dailyTaskCommunityReward;
      const joined = await isChatMember(
        TELEGRAM_BOT_TOKEN.value(),
        config.communityChatId,
        telegramId,
      );
      if (!joined) throw new HttpsError("failed-precondition", "Join the community channel first.");
    } else if (key === "payment") {
      amount = config.dailyTaskPaymentReward;
      const joined = await isChatMember(
        TELEGRAM_BOT_TOKEN.value(),
        config.paymentChatId,
        telegramId,
      );
      if (!joined) throw new HttpsError("failed-precondition", "Join the payouts channel first.");
    } else {
      amount = config.dailyReferralTaskReward;
      const since = Date.parse(`${today}T00:00:00.000Z`);
      const refs = await col
        .referrals()
        .where("inviterTelegramId", "==", telegramId)
        .where("createdAt", ">=", since)
        .limit(1)
        .get();
      if (refs.empty) throw new HttpsError("failed-precondition", "Invite a friend today first.");
    }

    const dailyRef = col.user(uid).collection("dailyTasks").doc(today);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(dailyRef);
      if (snap.exists && snap.data()?.[key] === true) {
        throw new HttpsError("already-exists", "Already claimed today.");
      }
      tx.set(dailyRef, { [key]: true, updatedAt: nowMs() }, { merge: true });
    });

    return award({
      uid,
      type: "daily_task",
      label: `Daily task · ${key}`,
      amount,
      idempotencyKey: `dailytask_${today}_${key}`,
    });
  },
);
