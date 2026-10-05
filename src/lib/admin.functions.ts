import { createServerFn } from "@tanstack/react-start";

const SESSION_HOURS = 2;
const DEFAULT_CONFIG_ARRAY_KEYS = ["dailyRewards"];

/** Only JSON-safe scalars cross the wire to the admin screen. */
export type AdminRow = Record<string, string | number | boolean | null>;

async function requireAdmin(token: string, adminToken: string) {
  const { requireUser } = await import("./server/user.server");
  const { db } = await import("./server/db.server");
  const { row } = await requireUser(token, { allowSuspended: true });

  const adminTelegramId = process.env["BEARFARM_ADMIN_TELEGRAM_ID"];
  if (!adminTelegramId || row.telegram_id !== adminTelegramId) {
    throw new Error("Not authorised.");
  }
  const session = await db()
    .from("admin_sessions")
    .select("token, telegram_id, expires_at")
    .eq("token", adminToken)
    .maybeSingle();
  if (!session.data || Date.parse(session.data.expires_at as string) < Date.now()) {
    throw new Error("Admin session expired. Sign in again.");
  }
  if (session.data.telegram_id !== row.telegram_id) throw new Error("Not authorised.");
  return { row };
}

async function audit(actor: string, action: string, target: string | null, meta: unknown) {
  const { db } = await import("./server/db.server");
  await db()
    .from("audit_log")
    .insert({ actor, action, target, meta: (meta ?? {}) as Record<string, unknown> });
}

/** Admin login: correct Telegram account AND username/password. */
export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; username: string; password: string }) => ({
    token: String(input?.token ?? ""),
    username: String(input?.username ?? "").slice(0, 64),
    password: String(input?.password ?? "").slice(0, 128),
  }))
  .handler(async ({ data }): Promise<{ ok: true; adminToken: string; expiresAt: number }> => {
    const { requireUser } = await import("./server/user.server");
    const { rateLimit } = await import("./server/session.server");
    const { db } = await import("./server/db.server");
    const { notifyAdmin } = await import("./server/telegram.server");

    const { row } = await requireUser(data.token, { allowSuspended: true });
    await rateLimit(`adminlogin:${row.id}`, 6, 900);

    const adminTelegramId = process.env["BEARFARM_ADMIN_TELEGRAM_ID"]?.trim();
    const username = process.env["BEARFARM_ADMIN_USERNAME"]?.trim();
    const password = process.env["BEARFARM_ADMIN_PASSWORD"]?.trim();
    if (!adminTelegramId || !username || !password) throw new Error("Admin access is not configured.");

    // Mobile keyboards auto-capitalise and add trailing spaces: usernames are
    // case-insensitive, both fields are trimmed, and compared in constant time.
    const digest = async (v: string) =>
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
    const same = async (a: string, b: string) => {
      const [x, y] = await Promise.all([digest(a), digest(b)]);
      let diff = 0;
      for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
      return diff === 0;
    };
    const userOk = await same(data.username.trim().toLowerCase(), username.toLowerCase());
    const passOk = await same(data.password.trim(), password);
    const ok = row.telegram_id === adminTelegramId && userOk && passOk;
    if (!ok) {
      await audit(row.telegram_id, "admin_login_failed", null, { username: data.username });
      void notifyAdmin("🚨 Failed admin login attempt.");
      throw new Error("Wrong username or password.");
    }

    const adminToken = crypto.randomUUID().replace(/-/g, "");
    const expiresAt = Date.now() + SESSION_HOURS * 3600_000;
    await db().from("admin_sessions").insert({
      token: adminToken,
      telegram_id: row.telegram_id,
      expires_at: new Date(expiresAt).toISOString(),
    });
    await audit(row.telegram_id, "admin_login", null, {});
    return { ok: true, adminToken, expiresAt };
  });

export const adminList = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { token: string; adminToken: string; resource: string; query?: string | null }) => ({
      token: String(input?.token ?? ""),
      adminToken: String(input?.adminToken ?? "").slice(0, 64),
      resource: String(input?.resource ?? "").slice(0, 32),
      query: input?.query ? String(input.query).slice(0, 64) : null,
    }),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      rows: AdminRow[];
      nextCursor: string | null;
      stats?: Record<string, number> | undefined;
    }> => {
      await requireAdmin(data.token, data.adminToken);
      const { db } = await import("./server/db.server");
      const { loadConfig } = await import("./server/config.server");
      const client = db();

      if (data.resource === "overview") {
        const [users, pending, susp, paid] = await Promise.all([
          client.from("users").select("id", { count: "exact", head: true }),
          client.from("withdrawals").select("id", { count: "exact", head: true }).eq("status", "pending"),
          client.from("users").select("id", { count: "exact", head: true }).eq("suspended", true),
          client.from("stats").select("paid_usd, tokens_minted").eq("id", "global").maybeSingle(),
        ]);
        return {
          rows: [],
          nextCursor: null,
          stats: {
            users: users.count ?? 0,
            pendingWithdrawals: pending.count ?? 0,
            suspended: susp.count ?? 0,
            paidUsd: Number(paid.data?.paid_usd ?? 0),
            tokensMinted: Number(paid.data?.tokens_minted ?? 0),
          },
        };
      }

      if (data.resource === "config") {
        const config = await loadConfig();
        return {
          rows: Object.entries(config).map(([key, value]) => ({
            id: key,
            key,
            value: Array.isArray(value) ? value.join(",") : String(value),
          })),
          nextCursor: null,
        };
      }

      if (data.resource === "users") {
        let q = client
          .from("users")
          .select(
            "id, telegram_id, username, first_name, balance, lifetime_earned, suspended, wallet_address, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(50);
        if (data.query) {
          q = q.or(
            `telegram_id.ilike.%${data.query}%,username.ilike.%${data.query}%,first_name.ilike.%${data.query}%`,
          );
        }
        const { data: rows } = await q;
        const ids = (rows ?? []).map((r) => r.id as string);
        const counts = new Map<string, number>();
        if (ids.length > 0) {
          const { data: refs } = await client.from("referrals").select("referrer_id").in("referrer_id", ids);
          for (const r of refs ?? []) {
            const key = r.referrer_id as string;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        return {
          rows: (rows ?? []).map((r) => ({
            id: r.id as string,
            telegramId: r.telegram_id as string,
            username: (r.username as string) ?? "",
            firstName: (r.first_name as string) ?? "",
            balance: Number(r.balance),
            totalEarned: Number(r.lifetime_earned),
            referralCount: counts.get(r.id as string) ?? 0,
            wallet: (r.wallet_address as string) ?? "",
            suspended: Boolean(r.suspended),
            createdAt: (r.created_at as string) ?? "",
          })),
          nextCursor: null,
        };
      }

      if (data.resource === "withdrawals") {
        const { data: rows } = await client
          .from("withdrawals")
          .select("id, user_id, tokens, net_usd, fee_usd, wallet_address, status, tx_id, created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        const list = rows ?? [];
        const owners = new Map<string, { username: string; telegramId: string }>();
        if (list.length > 0) {
          const { data: people } = await client
            .from("users")
            .select("id, username, telegram_id")
            .in("id", list.map((w) => w.user_id as string));
          for (const p of people ?? []) {
            owners.set(p.id as string, {
              username: (p.username as string) ?? "",
              telegramId: p.telegram_id as string,
            });
          }
        }
        return {
          rows: list.map((w, index) => ({
            id: w.id as string,
            number: list.length - index,
            amountTokens: Number(w.tokens),
            netUsd: Number(w.net_usd),
            feeUsd: Number(w.fee_usd),
            address: w.wallet_address as string,
            status: w.status as string,
            txId: (w.tx_id as string) ?? "",
            username: owners.get(w.user_id as string)?.username ?? "",
            telegramId: owners.get(w.user_id as string)?.telegramId ?? "",
            createdAt: (w.created_at as string) ?? "",
          })),
          nextCursor: null,
        };
      }

      if (data.resource === "tasks") {
        const { data: rows } = await client
          .from("tasks")
          .select("id, group_name, kind, title, url, chat_id, reward, wait_secs, active, sort_order, icon_url")
          .order("sort_order", { ascending: true })
          .limit(100);
        return {
          rows: (rows ?? []).map((t) => ({
            id: t.id as string,
            group: t.group_name as string,
            kind: t.kind as string,
            title: (t.title as string) ?? "",
            url: (t.url as string) ?? "",
            chatId: (t.chat_id as string) ?? "",
            reward: Number(t.reward),
            waitSecs: Number(t.wait_secs),
            iconUrl: (t.icon_url as string) ?? "",
            active: Boolean(t.active),
          })),
          nextCursor: null,
        };
      }

      if (data.resource === "adnetworks") {
        const { data: rows } = await client
          .from("ad_networks")
          .select("id, name, provider, block_id, url, logo_url, reward, daily_limit, cooldown_secs, min_watch_secs, active, sort_order")
          .order("sort_order", { ascending: true });
        return {
          rows: (rows ?? []).map((n) => ({
            id: n.id as string,
            name: (n.name as string) ?? "",
            provider: (n.provider as string) ?? "link",
            blockId: (n.block_id as string) ?? "",
            url: (n.url as string) ?? "",
            logoUrl: (n.logo_url as string) ?? "",
            reward: Number(n.reward),
            dailyLimit: Number(n.daily_limit),
            cooldownSecs: Number(n.cooldown_secs),
            minWatchSecs: Number(n.min_watch_secs),
            active: Boolean(n.active),
          })),
          nextCursor: null,
        };
      }

      if (data.resource === "codes") {
        const { data: rows } = await client
          .from("reward_codes")
          .select("code, reward, max_uses, used_count, active, expires_at")
          .order("created_at", { ascending: false })
          .limit(100);
        return {
          rows: (rows ?? []).map((c) => ({
            id: c.code as string,
            code: c.code as string,
            reward: Number(c.reward),
            claims: Number(c.used_count),
            maxClaims: Number(c.max_uses),
            active: Boolean(c.active),
          })),
          nextCursor: null,
        };
      }

      if (data.resource === "audit") {
        const { data: rows } = await client
          .from("audit_log")
          .select("id, actor, action, target, meta, created_at")
          .order("id", { ascending: false })
          .limit(100);
        return {
          rows: (rows ?? []).map((r) => ({
            id: String(r.id),
            actor: (r.actor as string) ?? "",
            adminId: (r.actor as string) ?? "",
            action: (r.action as string) ?? "",
            target: (r.target as string) ?? null,
            targetId: (r.target as string) ?? "",
            meta: JSON.stringify(r.meta ?? {}),
            created_at: (r.created_at as string) ?? "",
          })),
          nextCursor: null,
        };
      }

      return { rows: [], nextCursor: null };
    },
  );

export const adminAction = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      token: string;
      adminToken: string;
      action: string;
      payload?: Record<string, unknown>;
    }) => ({
      token: String(input?.token ?? ""),
      adminToken: String(input?.adminToken ?? "").slice(0, 64),
      action: String(input?.action ?? "").slice(0, 40),
      payload: (input?.payload ?? {}) as Record<string, unknown>,
    }),
  )
  .handler(async ({ data }): Promise<{ ok: true; message?: string }> => {
    const { row: admin } = await requireAdmin(data.token, data.adminToken);
    const { db } = await import("./server/db.server");
    const { award } = await import("./server/ledger.server");
    const { loadConfig, invalidateConfigCache, CONFIG_BOUNDS, withdrawalMath } = await import(
      "./server/config.server"
    );
    const { sendMessage, payoutButtons, connectWebhook } = await import("./server/telegram.server");
    const client = db();
    const p = data.payload;
    const str = (key: string, max = 200) => String(p[key] ?? "").trim().slice(0, max);
    // The admin screen uses friendly names; normalise them here.
    const targetId =
      str("id", 64) || str("userId", 64) || str("withdrawalId", 64) || str("taskId", 64) || str("codeId", 64);
    const aliases: Record<string, string> = {
      createTask: "upsertTask",
      updateTask: "upsertTask",
      createRewardCode: "createCode",
      disableRewardCode: "disableCode",
      suspend: "suspendUser",
      unsuspend: "unsuspendUser",
    };
    const action = aliases[data.action] ?? data.action;

    switch (action) {
      case "approveWithdrawal": {
        const id = targetId;
        const txId = str("txId", 120);
        if (!txId) throw new Error("Transaction ID is required.");
        const wd = await client
          .from("withdrawals")
          .update({ status: "approved", tx_id: txId, reviewed_by: admin.telegram_id, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("status", "pending")
          .select("id, user_id, tokens, net_usd")
          .maybeSingle();
        if (!wd.data) throw new Error("This withdrawal is not pending anymore.");

        const user = await client
          .from("users")
          .select("telegram_id, total_paid_usd")
          .eq("id", wd.data.user_id as string)
          .single();
        await client
          .from("users")
          .update({ total_paid_usd: Number(user.data?.total_paid_usd ?? 0) + Number(wd.data.net_usd) })
          .eq("id", wd.data.user_id as string);

        const stats = await client.from("stats").select("paid_usd").eq("id", "global").maybeSingle();
        await client
          .from("stats")
          .update({ paid_usd: Number(stats.data?.paid_usd ?? 0) + Number(wd.data.net_usd), updated_at: new Date().toISOString() })
          .eq("id", "global");

        const config = await loadConfig();
        const owner = await client
          .from("users")
          .select("first_name, username")
          .eq("id", wd.data.user_id as string)
          .maybeSingle();
        const rawName = String(owner.data?.first_name || owner.data?.username || "Farmer");
        const shown = rawName.replace(/[<>&]/g, "").slice(0, 3) + "***";
        const usd = Number(wd.data.net_usd).toFixed(4);
        const when = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
        const shortTx = txId.length > 18 ? `${txId.slice(0, 10)}…${txId.slice(-6)}` : txId;
        if (user.data?.telegram_id) {
          void sendMessage(
            user.data.telegram_id as string,
            `✅ <b>WITHDRAWAL PAID!</b> 🎉\n\n` +
              `💵 Amount: <b>$${usd} USDT</b>\n` +
              `🌐 Network: BEP-20 (BSC)\n` +
              `🔗 TX: <code>${txId.replace(/[<>&]/g, "")}</code>\n` +
              `🕒 ${when}\n\n` +
              `Thank you for farming with us! 🐻🌾`,
            payoutButtons(txId),
          );
        }
        void sendMessage(
          config.paymentChannelUrl.replace("https://t.me/", "@"),
          `💸 <b>NEW PAYOUT SENT</b> ✅\n\n` +
            `👤 Farmer: <b>${shown}</b>\n` +
            `💵 Amount: <b>$${usd} USDT</b>\n` +
            `🌐 Network: BEP-20 (BSC)\n` +
            `🔗 TX: <code>${shortTx.replace(/[<>&]/g, "")}</code>\n` +
            `🕒 ${when}\n\n` +
            `🐻 Bear Farm — real farming, real payouts 🌾`,
          payoutButtons(txId),
        );
        await audit(admin.telegram_id, "approveWithdrawal", id, { txId });
        return { ok: true, message: "Withdrawal approved." };
      }

      case "rejectWithdrawal": {
        const id = targetId;
        const reason = str("reason", 200) || "Rejected by admin";
        const wd = await client
          .from("withdrawals")
          .update({ status: "rejected", reviewed_by: admin.telegram_id, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("status", "pending")
          .select("id, user_id, tokens")
          .maybeSingle();
        if (!wd.data) throw new Error("This withdrawal is not pending anymore.");

        await award({
          userId: wd.data.user_id as string,
          amount: Number(wd.data.tokens),
          kind: "withdrawal_refund",
          label: "Withdrawal rejected · refund",
          idempotencyKey: `refund:${id}`,
        });
        const user = await client
          .from("users")
          .select("telegram_id")
          .eq("id", wd.data.user_id as string)
          .single();
        if (user.data?.telegram_id) {
          void sendMessage(
            user.data.telegram_id as string,
            `❌ <b>Withdrawal rejected</b>\n📝 ${reason}\n🌾 Your tokens were returned.`,
          );
        }
        await audit(admin.telegram_id, "rejectWithdrawal", id, { reason });
        return { ok: true, message: "Withdrawal rejected and refunded." };
      }

      case "connectBot": {
        const secret = process.env["BEARFARM_TG_WEBHOOK_SECRET"];
        if (!secret) throw new Error("Webhook secret is not configured on the server.");
        const { getRequest } = await import("@tanstack/react-start/server");
        const origin = new URL(getRequest().url).origin;
        if (!origin.startsWith("https://")) throw new Error("Open the admin panel from the live site to connect the bot.");
        const res = await connectWebhook(origin, secret);
        await audit(admin.telegram_id, "connectBot", res.url, { ok: res.ok });
        if (!res.ok) throw new Error(`Telegram refused: ${res.description || "unknown error"}`);
        return { ok: true, message: `Bot connected to ${res.url}` };
      }

      case "checkUser": {
        const { enforceIntegrity } = await import("./server/integrity.server");
        const u = await client.from("users").select("telegram_id").eq("id", targetId).maybeSingle();
        if (!u.data) throw new Error("User not found.");
        const r = await enforceIntegrity(targetId, u.data.telegram_id as string);
        return { ok: true, message: r.ok ? "✅ Balance and activity look correct." : `🚫 Suspended: ${r.reason}` };
      }

      case "suspendUser":
      case "unsuspendUser": {
        const id = targetId;
        const suspend = action === "suspendUser";
        await client
          .from("users")
          .update({
            suspended: suspend,
            suspended_reason: suspend ? str("reason", 200) || "Suspended by admin" : null,
          })
          .eq("id", id);
        await audit(admin.telegram_id, data.action, id, {});
        return { ok: true, message: suspend ? "User suspended." : "User restored." };
      }

      case "adjustBalance": {
        const id = targetId;
        const amount = Math.floor(Number(p["amount"] ?? 0));
        if (!amount) throw new Error("Enter an amount.");
        await client.rpc("bf_apply_amount", {
          p_user: id,
          p_amount: amount,
          p_kind: "admin_adjust",
          p_label: str("note", 120) || "Admin adjustment",
          p_meta: { by: admin.telegram_id },
        });
        await audit(admin.telegram_id, "adjustBalance", id, { amount });
        return { ok: true, message: "Balance updated." };
      }

      case "upsertTask": {
        const kindMap: Record<string, string> = {
          telegram_channel: "channel",
          channel: "channel",
          mini_app: "mini_app",
          link: "link",
        };
        const id = targetId;
        const patch: Record<string, unknown> = {};
        if (p["group"] !== undefined) {
          patch["group_name"] = ["daily", "main", "partner"].includes(str("group", 16))
            ? str("group", 16)
            : "main";
        }
        if (p["kind"] !== undefined) patch["kind"] = kindMap[str("kind", 24)] ?? "link";
        if (p["title"] !== undefined) patch["title"] = str("title", 120);
        if (p["description"] !== undefined) patch["description"] = str("description", 300);
        if (p["url"] !== undefined) patch["url"] = str("url", 300);
        if (p["chatId"] !== undefined) patch["chat_id"] = str("chatId", 64) || null;
        if (p["reward"] !== undefined) patch["reward"] = Math.max(0, Math.floor(Number(p["reward"])));
        if (p["waitSecs"] !== undefined) {
          patch["wait_secs"] = Math.min(600, Math.max(3, Math.floor(Number(p["waitSecs"]))));
        }
        if (p["active"] !== undefined) patch["active"] = Boolean(p["active"]);
        if (p["sortOrder"] !== undefined) patch["sort_order"] = Math.floor(Number(p["sortOrder"]));
        if (p["iconUrl"] !== undefined) patch["icon_url"] = safeHttpsUrl(str("iconUrl", 300));

        if (id) {
          if (Object.keys(patch).length === 0) throw new Error("Nothing to update.");
          await client.from("tasks").update(patch).eq("id", id);
        } else {
          if (!patch["title"] || !patch["url"]) throw new Error("Title and URL are required.");
          if (patch["kind"] === "channel" && !patch["chat_id"]) {
            throw new Error("Channel tasks need the channel chat ID.");
          }
          await client.from("tasks").insert({
            group_name: patch["group_name"] ?? "main",
            kind: patch["kind"] ?? "link",
            title: patch["title"],
            description: patch["description"] ?? "",
            url: patch["url"],
            chat_id: patch["chat_id"] ?? null,
            reward: patch["reward"] ?? 0,
            wait_secs: patch["wait_secs"] ?? 5,
            active: patch["active"] ?? true,
            sort_order: patch["sort_order"] ?? 0,
            icon_url: patch["icon_url"] ?? null,
          });
        }
        await audit(admin.telegram_id, "upsertTask", id || String(patch["title"] ?? ""), {});
        return { ok: true, message: "Task saved." };
      }

      case "upsertAdNetwork": {
        const id = targetId;
        if (!id) throw new Error("Network ID is required.");
        const patch: Record<string, unknown> = {};
        const num = (k: string, min: number, max: number) =>
          Math.min(max, Math.max(min, Math.floor(Number(p[k]) || 0)));
        if (p["name"] !== undefined) patch["name"] = str("name", 60);
        if (p["blockId"] !== undefined) patch["block_id"] = str("blockId", 80) || null;
        if (p["url"] !== undefined) patch["url"] = safeHttpsUrl(str("url", 300));
        if (p["logoUrl"] !== undefined) patch["logo_url"] = safeHttpsUrl(str("logoUrl", 300));
        if (p["reward"] !== undefined) patch["reward"] = num("reward", 1, 1000);
        if (p["dailyLimit"] !== undefined) patch["daily_limit"] = num("dailyLimit", 0, 500);
        if (p["cooldownSecs"] !== undefined) patch["cooldown_secs"] = num("cooldownSecs", 0, 86400);
        if (p["minWatchSecs"] !== undefined) patch["min_watch_secs"] = num("minWatchSecs", 5, 120);
        if (p["active"] !== undefined) patch["active"] = p["active"] === true || p["active"] === "true";
        if (Object.keys(patch).length === 0) throw new Error("Nothing to update.");
        const res = await client.from("ad_networks").update(patch).eq("id", id);
        if (res.error) throw new Error("Could not save the ad network.");
        await audit(admin.telegram_id, "upsertAdNetwork", id, patch);
        return { ok: true, message: "Ad network saved." };
      }

      case "deleteTask": {
        const id = targetId;
        await client.from("tasks").update({ active: false }).eq("id", id);
        await audit(admin.telegram_id, "deleteTask", id, {});
        return { ok: true, message: "Task disabled." };
      }

      case "createCode": {
        const code = str("code", 32).toUpperCase();
        if (!code) throw new Error("Enter a code.");
        const insert = await client.from("reward_codes").insert({
          code,
          reward: Math.max(1, Math.floor(Number(p["reward"] ?? 0))),
          max_uses: Math.max(1, Math.floor(Number(p["maxUses"] ?? p["maxClaims"] ?? 1))),
          expires_at: p["expiresAt"] ? new Date(Number(p["expiresAt"])).toISOString() : null,
        });
        if (insert.error) throw new Error("That code already exists.");
        await audit(admin.telegram_id, "createCode", code, {});
        return { ok: true, message: "Code created." };
      }

      case "disableCode": {
        const code = (str("code", 32) || targetId).toUpperCase();
        await client.from("reward_codes").update({ active: false }).eq("code", code);
        await audit(admin.telegram_id, "disableCode", code, {});
        return { ok: true, message: "Code disabled." };
      }

      case "updateConfig": {
        const single = str("key", 60);
        const patch = single
          ? {
              [single]: Array.isArray(DEFAULT_CONFIG_ARRAY_KEYS) && DEFAULT_CONFIG_ARRAY_KEYS.includes(single)
                ? str("value", 200)
                    .split(",")
                    .map((v) => Number(v.trim()))
                : str("value", 300),
            }
          : ((p["config"] ?? {}) as Record<string, unknown>);
        const current = await loadConfig();
        const next: Record<string, unknown> = { ...current };
        for (const [key, value] of Object.entries(patch)) {
          if (!(key in current)) continue;
          const bounds = CONFIG_BOUNDS[key];
          if (bounds) {
            const num = Number(value);
            if (!Number.isFinite(num) || num < bounds[0] || num > bounds[1]) {
              throw new Error(`${key} must be between ${bounds[0]} and ${bounds[1]}.`);
            }
            next[key] = num;
          } else if (typeof (current as unknown as Record<string, unknown>)[key] === "boolean") {
            next[key] = value === true || value === "true" || value === "1";
          } else if (Array.isArray((current as unknown as Record<string, unknown>)[key])) {
            const arr = Array.isArray(value) ? value.map((v) => Math.max(0, Math.floor(Number(v)))) : null;
            if (!arr || arr.length !== 7) throw new Error("Daily rewards need 7 values.");
            next[key] = arr;
          } else {
            next[key] = String(value).slice(0, 300);
          }
        }
        await client
          .from("app_config")
          .upsert({ id: "default", data: next, updated_at: new Date().toISOString() });
        invalidateConfigCache();
        await audit(admin.telegram_id, "updateConfig", single || null, { keys: Object.keys(patch) });
        return { ok: true, message: "Settings saved." };
      }

      case "previewWithdrawFee": {
        const config = await loadConfig();
        const math = withdrawalMath(Math.floor(Number(p["tokens"] ?? 0)), config);
        return { ok: true, message: `Net $${math.netUsd} · fee $${math.feeUsd}` };
      }

      default:
        throw new Error("Unknown action.");
    }
  });

/** Only plain https links are stored (imgbb etc.); anything else is dropped. */
function safeHttpsUrl(value: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
