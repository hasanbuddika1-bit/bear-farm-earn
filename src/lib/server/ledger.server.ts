import { db } from "./db.server";

/**
 * Append-only reward ledger. Every credit/debit is idempotent: the caller
 * supplies a key, and a repeated key is a no-op instead of a double reward.
 */
export async function award(opts: {
  userId: string;
  amount: number;
  kind: string;
  label: string;
  idempotencyKey: string;
  meta?: Record<string, unknown>;
}): Promise<{ awarded: number; balance: number }> {
  const client = db();
  const amount = Math.floor(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid reward amount.");

  const claim = await client
    .from("idempotency")
    .insert({ key: opts.idempotencyKey, user_id: opts.userId });
  if (claim.error) {
    const { data } = await client
      .from("users")
      .select("balance")
      .eq("id", opts.userId)
      .maybeSingle();
    return { awarded: 0, balance: Number(data?.balance ?? 0) };
  }

  const { data: rpc, error } = await client.rpc("bf_apply_amount", {
    p_user: opts.userId,
    p_amount: amount,
    p_kind: opts.kind,
    p_label: opts.label,
    p_meta: opts.meta ?? {},
  });
  if (error) throw new Error(error.message);
  return { awarded: amount, balance: Number(rpc ?? 0) };
}

export async function debit(opts: {
  userId: string;
  amount: number;
  kind: string;
  label: string;
  idempotencyKey: string;
  meta?: Record<string, unknown>;
}): Promise<{ balance: number }> {
  const client = db();
  const amount = Math.floor(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid amount.");

  const claim = await client
    .from("idempotency")
    .insert({ key: opts.idempotencyKey, user_id: opts.userId });
  if (claim.error) throw new Error("This request was already processed.");

  const { data: rpc, error } = await client.rpc("bf_apply_amount", {
    p_user: opts.userId,
    p_amount: -amount,
    p_kind: opts.kind,
    p_label: opts.label,
    p_meta: opts.meta ?? {},
  });
  if (error) throw new Error(error.message);
  return { balance: Number(rpc ?? 0) };
}

/** Sum of ledger amounts — used by the audit job to detect tampering. */
export async function ledgerSum(userId: string): Promise<number> {
  const { data, error } = await db().rpc("bf_ledger_sum", { p_user: userId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
