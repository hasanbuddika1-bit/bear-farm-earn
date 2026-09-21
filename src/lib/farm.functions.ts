import { createServerFn } from "@tanstack/react-start";

import type { TaskDoc, UserDoc } from "./types";

const tokenInput = (input: { token: string }) => ({ token: String(input?.token ?? "") });

/** Starts a mining cycle. The end time is set by the server clock only. */
export const startMining = createServerFn({ method: "POST" })
  .inputValidator(tokenInput)
  .handler(async ({ data }): Promise<UserDoc> => {
    const { requireUser, toUserDoc, USER_COLUMNS } = await import("./server/user.server");
    const { loadConfig } = await import("./server/config.server");
    const { rateLimit } = await import("./server/session.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`mine:${row.id}`, 10, 60);
    const config = await loadConfig();

    const endsAt = row.mining_ends_at ? Date.parse(row.mining_ends_at) : 0;
    if (row.mining_claimable || (endsAt && endsAt > Date.now())) {
      throw new Error("Mining is already running.");
    }
    if (endsAt && endsAt <= Date.now() && row.mining_reward > 0) {
      throw new Error("Claim your mined tokens first.");
    }

    const now = Date.now();
    const updated = await db()
      .from("users")
      .update({
        mining_started_at: new Date(now).toISOString(),
        mining_ends_at: new Date(now + config.miningCycleMinutes * 60_000).toISOString(),
        mining_reward: config.miningRewardPerCycle,
        mining_claimable: false,
        updated_at: new Date(now).toISOString(),
      })
      .eq("id", row.id)
      .select(USER_COLUMNS)
      .single();
    if (updated.error) throw new Error("Could not start mining. Please try again.");
    return toUserDoc(updated.data as never);
  });

/** Credits the mined tokens once the cycle has really finished. */
export const claimMining = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; idempotencyKey: string }) => ({
    token: String(input?.token ?? ""),
    idempotencyKey: String(input?.idempotencyKey ?? "").slice(0, 120),
  }))
  .handler(async ({ data }): Promise<{ user: UserDoc; awarded: number }> => {
    const { requireUser, toUserDoc, USER_COLUMNS } = await import("./server/user.server");
    const { award } = await import("./server/ledger.server");
    const { rateLimit } = await import("./server/session.server");
    const { sendMessage } = await import("./server/telegram.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`claimmine:${row.id}`, 15, 60);

    const endsAt = row.mining_ends_at ? Date.parse(row.mining_ends_at) : 0;
    if (!endsAt || endsAt > Date.now()) throw new Error("Mining is still running.");
    if (row.mining_reward <= 0) throw new Error("Nothing to claim yet.");

    const cleared = await db()
      .from("users")
      .update({ mining_reward: 0, mining_claimable: false, mining_ends_at: null, mining_started_at: null })
      .eq("id", row.id)
      .gt("mining_reward", 0)
      .select("id");
    if (!cleared.data || cleared.data.length === 0) throw new Error("Already claimed.");

    const result = await award({
      userId: row.id,
      amount: row.mining_reward,
      kind: "mining",
      label: "Mining reward",
      idempotencyKey: `mine:${row.id}:${endsAt}`,
    });

    if (row.notifications) {
      void sendMessage(
        row.telegram_id,
        `⛏️ <b>Mining claimed!</b>\n🌾 +${result.awarded} BFT\n💰 Balance: ${result.balance} BFT`,
      );
    }

    const fresh = await db().from("users").select(USER_COLUMNS).eq("id", row.id).single();
    return { user: await toUserDoc(fresh.data as never), awarded: result.awarded };
  });

/** Daily streak reward, reset at 00:00:00 UTC. */
export const claimDaily = createServerFn({ method: "POST" })
  .inputValidator(tokenInput)
  .handler(async ({ data }): Promise<{ user: UserDoc; awarded: number; streak: number }> => {
    const { requireUser, toUserDoc, USER_COLUMNS } = await import("./server/user.server");
    const { loadConfig, utcDayKey, nextStreak } = await import("./server/config.server");
    const { award } = await import("./server/ledger.server");
    const { rateLimit } = await import("./server/session.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`daily:${row.id}`, 10, 60);
    const config = await loadConfig();
    const today = utcDayKey();
    const streak = nextStreak(row.last_daily_day, row.daily_streak, today, config.dailyRewards.length);
    if (streak === null) throw new Error("You already claimed today's reward.");

    const amount = config.dailyRewards[streak - 1] ?? config.dailyRewards[0] ?? 30;
    const claimed = await db()
      .from("users")
      .update({ last_daily_day: today, daily_streak: streak })
      .eq("id", row.id)
      .or(`last_daily_day.is.null,last_daily_day.neq.${today}`)
      .select("id");
    if (!claimed.data || claimed.data.length === 0) throw new Error("You already claimed today's reward.");

    await award({
      userId: row.id,
      amount,
      kind: "daily",
      label: `Daily reward · day ${streak}`,
      idempotencyKey: `daily:${row.id}:${today}`,
    });

    const fresh = await db().from("users").select(USER_COLUMNS).eq("id", row.id).single();
    return { user: await toUserDoc(fresh.data as never), awarded: amount, streak };
  });

export const claimRewardCode = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; code: string }) => ({
    token: String(input?.token ?? ""),
    code: String(input?.code ?? "")
      .trim()
      .toUpperCase()
      .slice(0, 32),
  }))
  .handler(async ({ data }): Promise<{ awarded: number; balance: number }> => {
    const { requireUser } = await import("./server/user.server");
    const { award } = await import("./server/ledger.server");
    const { rateLimit } = await import("./server/session.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`code:${row.id}`, 8, 300);
    if (!data.code) throw new Error("Enter a reward code.");
    const client = db();

    const code = await client
      .from("reward_codes")
      .select("code, reward, max_uses, used_count, active, expires_at")
      .eq("code", data.code)
      .maybeSingle();
    if (!code.data || !code.data.active) throw new Error("This code is not valid.");
    if (code.data.expires_at && Date.parse(code.data.expires_at as string) < Date.now()) {
      throw new Error("This code has expired.");
    }
    if (Number(code.data.used_count) >= Number(code.data.max_uses)) {
      throw new Error("This code has reached its limit.");
    }

    const claim = await client.from("code_claims").insert({ code: data.code, user_id: row.id });
    if (claim.error) throw new Error("You already used this code.");

    await client
      .from("reward_codes")
      .update({ used_count: Number(code.data.used_count) + 1 })
      .eq("code", data.code);

    const result = await award({
      userId: row.id,
      amount: Number(code.data.reward),
      kind: "reward_code",
      label: `Reward code ${data.code}`,
      idempotencyKey: `code:${row.id}:${data.code}`,
    });
    return { awarded: result.awarded, balance: result.balance };
  });

/** Lists tasks with a server-computed claimed flag. */
export const listTasks = createServerFn({ method: "POST" })
  .inputValidator(tokenInput)
  .handler(async ({ data }): Promise<{ daily: TaskDoc[]; main: TaskDoc[]; partner: TaskDoc[] }> => {
    const { requireUser } = await import("./server/user.server");
    const { utcDayKey } = await import("./server/config.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    const client = db();
    const today = utcDayKey();

    const [tasks, claims] = await Promise.all([
      client
        .from("tasks")
        .select("id, group_name, kind, title, description, url, chat_id, reward, wait_secs, active")
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      client.from("task_claims").select("task_key, day_key").eq("user_id", row.id),
    ]);

    const claimedKeys = new Set(
      (claims.data ?? []).map((c) => `${c.task_key as string}:${(c.day_key as string) ?? ""}`),
    );

    const groups: { daily: TaskDoc[]; main: TaskDoc[]; partner: TaskDoc[] } = {
      daily: [],
      main: [],
      partner: [],
    };
    for (const t of tasks.data ?? []) {
      const group = t.group_name as "daily" | "main" | "partner";
      const dayKey = group === "daily" ? today : "once";
      const doc: TaskDoc = {
        id: t.id as string,
        group: group === "partner" ? "partner" : "main",
        kind:
          t.kind === "channel" ? "telegram_channel" : t.kind === "mini_app" ? "mini_app" : "link",
        title: (t.title as string) ?? "",
        description: (t.description as string) ?? "",
        url: (t.url as string) ?? "",
        chatId: (t.chat_id as string) ?? null,
        reward: Number(t.reward),
        active: true,
        claimed: claimedKeys.has(`${t.id as string}:${dayKey}`),
      };
      groups[group].push(doc);
    }
    return groups;
  });

/** Starts the server-side wait timer for link / mini-app tasks. */
export const startTaskSession = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; taskId: string }) => ({
    token: String(input?.token ?? ""),
    taskId: String(input?.taskId ?? "").slice(0, 64),
  }))
  .handler(async ({ data }): Promise<{ readyAt: number }> => {
    const { requireUser } = await import("./server/user.server");
    const { rateLimit } = await import("./server/session.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`tasksession:${row.id}`, 60, 60);
    const client = db();
    const task = await client
      .from("tasks")
      .select("id, wait_secs, active")
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task.data || !task.data.active) throw new Error("This task is no longer available.");

    const readyAt = Date.now() + Math.max(3, Number(task.data.wait_secs ?? 5)) * 1000;
    await client
      .from("task_sessions")
      .upsert(
        { user_id: row.id, task_key: data.taskId, ready_at: new Date(readyAt).toISOString() },
        { onConflict: "user_id,task_key" },
      );
    return { readyAt };
  });

/** Claims a task. Channels are verified with the bot; timed tasks with the stored session. */
export const claimTask = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; taskId: string }) => ({
    token: String(input?.token ?? ""),
    taskId: String(input?.taskId ?? "").slice(0, 64),
  }))
  .handler(async ({ data }): Promise<{ awarded: number; balance: number }> => {
    const { requireUser } = await import("./server/user.server");
    const { award } = await import("./server/ledger.server");
    const { rateLimit } = await import("./server/session.server");
    const { isChatMember } = await import("./server/telegram.server");
    const { utcDayKey, loadConfig } = await import("./server/config.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`task:${row.id}`, 40, 60);
    const client = db();

    // Built-in daily tasks (community / payment channel visit, invite a friend).
    if (data.taskId === "community" || data.taskId === "payment" || data.taskId === "referral") {
      const config = await loadConfig();
      const dayKey = utcDayKey();
      let reward: number;

      if (data.taskId === "referral") {
        reward = config.dailyReferralTaskReward;
        const refs = await client
          .from("referrals")
          .select("id", { count: "exact", head: true })
          .eq("referrer_id", row.id)
          .gte("created_at", `${dayKey}T00:00:00Z`);
        if ((refs.count ?? 0) < 1) throw new Error("Invite at least 1 friend today, then claim.");
      } else {
        const url =
          data.taskId === "community" ? config.communityChannelUrl : config.paymentChannelUrl;
        reward =
          data.taskId === "community"
            ? config.dailyTaskCommunityReward
            : config.dailyTaskPaymentReward;
        const handle = `@${(url.split("?")[0] ?? "").split("/").filter(Boolean).pop() ?? ""}`;
        const joined = await isChatMember(handle, Number(row.telegram_id));
        if (!joined) throw new Error("Join the channel first, then tap Claim.");
      }

      const dailyClaim = await client
        .from("task_claims")
        .insert({ user_id: row.id, task_key: data.taskId, day_key: dayKey });
      if (dailyClaim.error) throw new Error("You already claimed this today.");

      const dailyResult = await award({
        userId: row.id,
        amount: reward,
        kind: "task_daily",
        label: "Daily task reward",
        idempotencyKey: `task:${row.id}:${data.taskId}:${dayKey}`,
      });
      return { awarded: dailyResult.awarded, balance: dailyResult.balance };
    }

    const task = await client
      .from("tasks")
      .select("id, group_name, kind, chat_id, reward, active")
      .eq("id", data.taskId)
      .maybeSingle();
    if (!task.data || !task.data.active) throw new Error("This task is no longer available.");

    const group = task.data.group_name as string;
    const dayKey = group === "daily" ? utcDayKey() : "once";

    if (task.data.kind === "channel") {
      if (!task.data.chat_id) throw new Error("This task is misconfigured.");
      const joined = await isChatMember(task.data.chat_id as string, Number(row.telegram_id));
      if (!joined) throw new Error("Join the channel first, then tap verify.");
    } else {
      const session = await client
        .from("task_sessions")
        .select("ready_at")
        .eq("user_id", row.id)
        .eq("task_key", data.taskId)
        .maybeSingle();
      if (!session.data) throw new Error("Open the task first.");
      if (Date.parse(session.data.ready_at as string) > Date.now()) {
        throw new Error("Please wait a few more seconds.");
      }
    }

    const claim = await client
      .from("task_claims")
      .insert({ user_id: row.id, task_key: data.taskId, day_key: dayKey });
    if (claim.error) throw new Error("You already claimed this task.");

    const result = await award({
      userId: row.id,
      amount: Number(task.data.reward),
      kind: `task_${group}`,
      label: "Task reward",
      idempotencyKey: `task:${row.id}:${data.taskId}:${dayKey}`,
    });
    return { awarded: result.awarded, balance: result.balance };
  });
