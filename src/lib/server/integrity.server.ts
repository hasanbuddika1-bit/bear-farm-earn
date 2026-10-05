import { db } from "./db.server";
import { ledgerSum } from "./ledger.server";
import { notifyAdmin } from "./telegram.server";

/** Earnings above this in one hour (excluding admin credits/refunds) are not humanly possible. */
const MAX_HOURLY_EARN = 20_000;
const EXEMPT = new Set(["admin_adjust", "withdrawal_refund", "referral_claim"]);

export interface IntegrityResult {
  ok: boolean;
  balance: number;
  ledger: number;
  lastHourEarned: number;
  reason: string | null;
}

/** Read-only check: balance must equal the ledger and earning speed must be sane. */
export async function inspectUser(userId: string): Promise<IntegrityResult> {
  const client = db();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [user, ledger, recent] = await Promise.all([
    client.from("users").select("balance").eq("id", userId).maybeSingle(),
    ledgerSum(userId),
    client
      .from("ledger")
      .select("amount, kind")
      .eq("user_id", userId)
      .gte("created_at", since)
      .gt("amount", 0)
      .limit(1000),
  ]);
  const balance = Number(user.data?.balance ?? 0);
  const lastHourEarned = (recent.data ?? [])
    .filter((r) => !EXEMPT.has(r.kind as string))
    .reduce((s, r) => s + Number(r.amount), 0);
  let reason: string | null = null;
  if (balance !== ledger) reason = `Balance ${balance} does not match ledger ${ledger}`;
  else if (lastHourEarned > MAX_HOURLY_EARN) reason = `Earned ${lastHourEarned} in one hour`;
  return { ok: reason === null, balance, ledger, lastHourEarned, reason };
}

/** Suspends the account and alerts the admin when the check fails. */
export async function enforceIntegrity(userId: string, telegramId: string): Promise<IntegrityResult> {
  const result = await inspectUser(userId);
  if (result.ok) return result;
  const client = db();
  await client
    .from("users")
    .update({ suspended: true, suspended_reason: "Unusual account activity. Contact support." })
    .eq("id", userId);
  await client.from("audit_log").insert({
    actor: "system",
    action: "auto_suspend",
    target: userId,
    meta: { reason: result.reason, balance: result.balance, ledger: result.ledger },
  });
  void notifyAdmin(`🚨 <b>Auto-suspended</b>\n👤 ${telegramId}\n⚠️ ${result.reason}`);
  return result;
}
