import type { UserDoc } from "../types";
import { db } from "./db.server";
import { readSession, type SessionClaims } from "./session.server";

export interface UserRow {
  id: string;
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  balance: number;
  lifetime_earned: number;
  wallet_address: string | null;
  is_admin: boolean;
  suspended: boolean;
  suspended_reason: string | null;
  referred_by: string | null;
  referral_pot: number;
  daily_streak: number;
  last_daily_day: string | null;
  ads_watched: number;
  withdrawal_count: number;
  total_paid_usd: number;
  mining_started_at: string | null;
  mining_ends_at: string | null;
  mining_reward: number;
  mining_claimable: boolean;
  language: string;
  notifications: boolean;
  created_at: string;
}

export const USER_COLUMNS =
  "id, telegram_id, username, first_name, last_name, photo_url, balance, lifetime_earned, wallet_address, is_admin, suspended, suspended_reason, referred_by, referral_pot, daily_streak, last_daily_day, ads_watched, withdrawal_count, total_paid_usd, mining_started_at, mining_ends_at, mining_reward, mining_claimable, language, notifications, created_at";

export async function toUserDoc(row: UserRow): Promise<UserDoc> {
  const client = db();
  const [{ count: totalRefs }, { count: activeRefs }] = await Promise.all([
    client.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", row.id),
    client
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", row.id)
      .in("stage", ["half", "verified"]),
  ]);

  const endsAt = row.mining_ends_at ? Date.parse(row.mining_ends_at) : null;
  return {
    telegramId: Number(row.telegram_id),
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    photoUrl: row.photo_url,
    balance: Number(row.balance),
    totalEarned: Number(row.lifetime_earned),
    withdrawalCount: Number(row.withdrawal_count),
    suspended: row.suspended,
    suspendedReason: row.suspended_reason,
    walletAddress: row.wallet_address,
    referralCode: row.telegram_id,
    referredBy: null,
    referralCount: totalRefs ?? 0,
    activeReferralCount: activeRefs ?? 0,
    referralPendingReward: Number(row.referral_pot),
    referralTotalEarned: Number(row.referral_pot),
    adsWatchedTotal: Number(row.ads_watched),
    language: row.language,
    notificationsEnabled: row.notifications,
    isAdmin: row.is_admin,
    mining: {
      active: Boolean(endsAt && !row.mining_claimable && endsAt > Date.now()),
      startedAt: row.mining_started_at ? Date.parse(row.mining_started_at) : null,
      endsAt,
      claimable: row.mining_claimable || Boolean(endsAt && endsAt <= Date.now() && row.mining_reward > 0),
    },
    daily: { streak: Number(row.daily_streak), lastClaimDay: row.last_daily_day },
    createdAt: Date.parse(row.created_at),
  };
}

/** Resolves the caller from a signed session token and blocks suspended accounts. */
export async function requireUser(
  token: string | null | undefined,
  opts: { allowSuspended?: boolean } = {},
): Promise<{ claims: SessionClaims; row: UserRow }> {
  const claims = await readSession(token);
  const { data, error } = await db()
    .from("users")
    .select(USER_COLUMNS)
    .eq("id", claims.uid)
    .maybeSingle();
  if (error || !data) throw new Error("Account not found. Reopen the mini app.");
  const row = data as unknown as UserRow;
  if (row.suspended && !opts.allowSuspended) {
    throw new Error(row.suspended_reason ?? "This account is suspended.");
  }
  return { claims, row };
}
