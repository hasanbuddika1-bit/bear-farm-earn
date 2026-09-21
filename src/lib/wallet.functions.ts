import { createServerFn } from "@tanstack/react-start";

import type { LedgerEntry, UserDoc, WithdrawalDoc } from "./types";

const BEP20 = /^0x[a-fA-F0-9]{40}$/;

export const setWallet = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; address: string }) => ({
    token: String(input?.token ?? ""),
    address: String(input?.address ?? "").trim().slice(0, 64),
  }))
  .handler(async ({ data }): Promise<{ address: string }> => {
    const { requireUser } = await import("./server/user.server");
    const { rateLimit } = await import("./server/session.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`wallet:${row.id}`, 10, 600);
    if (!BEP20.test(data.address)) throw new Error("Enter a valid USDT BEP-20 address (0x...).");

    const client = db();
    const taken = await client
      .from("users")
      .select("id")
      .eq("wallet_address", data.address)
      .neq("id", row.id)
      .limit(1);
    if ((taken.data ?? []).length > 0) {
      throw new Error("This wallet address is already linked to another account.");
    }

    const pending = await client
      .from("withdrawals")
      .select("id")
      .eq("user_id", row.id)
      .eq("status", "pending")
      .limit(1);
    if ((pending.data ?? []).length > 0) {
      throw new Error("You cannot change your wallet while a withdrawal is pending.");
    }

    const updated = await client
      .from("users")
      .update({ wallet_address: data.address })
      .eq("id", row.id)
      .select("wallet_address")
      .single();
    if (updated.error) throw new Error("Could not save your wallet address.");
    return { address: data.address };
  });

/** Debits the tokens and creates a pending payout in one guarded step. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; tokens: number; idempotencyKey: string }) => ({
    token: String(input?.token ?? ""),
    tokens: Math.floor(Number(input?.tokens ?? 0)),
    idempotencyKey: String(input?.idempotencyKey ?? "").slice(0, 120),
  }))
  .handler(async ({ data }): Promise<{ id: string; netUsd: number; feeUsd: number }> => {
    const { requireUser } = await import("./server/user.server");
    const { debit } = await import("./server/ledger.server");
    const { loadConfig, withdrawalMath } = await import("./server/config.server");
    const { rateLimit } = await import("./server/session.server");
    const { notifyAdmin, sendMessage } = await import("./server/telegram.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`withdraw:${row.id}`, 5, 600);
    const config = await loadConfig();
    const client = db();

    if (!row.wallet_address) throw new Error("Add your USDT BEP-20 wallet address first.");
    const minimum =
      row.withdrawal_count === 0 ? config.firstWithdrawMinTokens : config.nextWithdrawMinTokens;
    if (!Number.isFinite(data.tokens) || data.tokens < minimum) {
      throw new Error(`Minimum withdrawal is ${minimum} tokens.`);
    }
    if (data.tokens > Number(row.balance)) throw new Error("Not enough balance.");

    const pending = await client
      .from("withdrawals")
      .select("id")
      .eq("user_id", row.id)
      .eq("status", "pending")
      .limit(1);
    if ((pending.data ?? []).length > 0) throw new Error("You already have a pending withdrawal.");

    const math = withdrawalMath(data.tokens, config);
    if (math.netUsd <= 0) throw new Error("Amount is too small after fees.");

    await debit({
      userId: row.id,
      amount: data.tokens,
      kind: "withdrawal_hold",
      label: "Withdrawal request",
      idempotencyKey: data.idempotencyKey || `wd:${row.id}:${Date.now()}`,
      meta: { netUsd: math.netUsd },
    });

    const created = await client
      .from("withdrawals")
      .insert({
        user_id: row.id,
        tokens: data.tokens,
        gross_usd: math.grossUsd,
        fee_usd: math.feeUsd,
        net_usd: math.netUsd,
        wallet_address: row.wallet_address,
      })
      .select("id")
      .single();
    if (created.error) throw new Error("Could not create the withdrawal. Please contact support.");

    await client
      .from("users")
      .update({ withdrawal_count: Number(row.withdrawal_count) + 1 })
      .eq("id", row.id);

    void sendMessage(
      row.telegram_id,
      `🧾 <b>Withdrawal requested</b>\n💸 ${data.tokens} BFT → $${math.netUsd}\n⏳ Waiting for approval.`,
    );
    void notifyAdmin(
      `🧾 New withdrawal\n👤 ${row.first_name ?? row.telegram_id}\n💸 ${data.tokens} BFT = $${math.netUsd}\n📬 ${row.wallet_address}`,
    );

    return { id: created.data.id as string, netUsd: math.netUsd, feeUsd: math.feeUsd };
  });

export const listWithdrawals = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => ({ token: String(input?.token ?? "") }))
  .handler(async ({ data }): Promise<WithdrawalDoc[]> => {
    const { requireUser } = await import("./server/user.server");
    const { db } = await import("./server/db.server");
    const { row } = await requireUser(data.token, { allowSuspended: true });

    const { data: rows } = await db()
      .from("withdrawals")
      .select("id, tokens, gross_usd, fee_usd, net_usd, wallet_address, status, tx_id, created_at, updated_at")
      .eq("user_id", row.id)
      .order("created_at", { ascending: false })
      .limit(50);

    return (rows ?? []).map((w, index) => ({
      id: w.id as string,
      number: (rows ?? []).length - index,
      amountTokens: Number(w.tokens),
      feeUsd: Number(w.fee_usd),
      netUsd: Number(w.net_usd),
      address: w.wallet_address as string,
      status: w.status as WithdrawalDoc["status"],
      txId: (w.tx_id as string) ?? null,
      createdAt: Date.parse(w.created_at as string),
      reviewedAt: w.updated_at ? Date.parse(w.updated_at as string) : null,
    }));
  });

export const listLedger = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; cursor?: string | null }) => ({
    token: String(input?.token ?? ""),
    cursor: input?.cursor ? String(input.cursor).slice(0, 40) : null,
  }))
  .handler(async ({ data }): Promise<{ entries: LedgerEntry[]; nextCursor: string | null }> => {
    const { requireUser } = await import("./server/user.server");
    const { db } = await import("./server/db.server");
    const { row } = await requireUser(data.token, { allowSuspended: true });

    let query = db()
      .from("ledger")
      .select("id, kind, label, amount, created_at")
      .eq("user_id", row.id)
      .order("id", { ascending: false })
      .limit(25);
    if (data.cursor) query = query.lt("id", Number(data.cursor));

    const { data: rows } = await query;
    const entries: LedgerEntry[] = (rows ?? []).map((e) => ({
      id: String(e.id),
      type: e.kind as string,
      label: ((e.label as string) ?? (e.kind as string)) || "Activity",
      amount: Number(e.amount),
      status: "completed",
      createdAt: Date.parse(e.created_at as string),
    }));
    const last = entries.at(-1);
    return { entries, nextCursor: entries.length === 25 && last ? last.id : null };
  });

export const updatePreferences = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; language?: string; notificationsEnabled?: boolean }) => ({
    token: String(input?.token ?? ""),
    language: input?.language ? String(input.language).slice(0, 8) : undefined,
    notificationsEnabled:
      typeof input?.notificationsEnabled === "boolean" ? input.notificationsEnabled : undefined,
  }))
  .handler(async ({ data }): Promise<UserDoc> => {
    const { requireUser, toUserDoc, USER_COLUMNS } = await import("./server/user.server");
    const { db } = await import("./server/db.server");
    const { row } = await requireUser(data.token, { allowSuspended: true });

    const patch: Record<string, unknown> = {};
    if (data.language) patch["language"] = data.language;
    if (data.notificationsEnabled !== undefined) patch["notifications"] = data.notificationsEnabled;
    if (Object.keys(patch).length === 0) return toUserDoc(row);

    const updated = await db()
      .from("users")
      .update(patch)
      .eq("id", row.id)
      .select(USER_COLUMNS)
      .single();
    return toUserDoc((updated.data ?? row) as never);
  });
