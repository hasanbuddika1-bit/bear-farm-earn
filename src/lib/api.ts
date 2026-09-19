import { callable } from "./firebase";
import type { AppConfig, LedgerEntry, ReferralRow, TaskDoc, WithdrawalDoc } from "./types";

/** Every sensitive operation is a Cloud Function call — the client never writes balances. */
export const api = {
  telegramAuth: callable<
    { initData: string; startParam?: string | null; deviceId: string },
    { token: string; isNewUser: boolean }
  >("telegramAuth"),

  bootstrap: callable<void, { config: AppConfig; serverTime: number }>("bootstrap"),

  startMining: callable<void, { endsAt: number }>("startMining"),
  claimMining: callable<{ idempotencyKey: string }, { awarded: number; balance: number }>(
    "claimMining",
  ),

  claimDaily: callable<
    { idempotencyKey: string },
    { awarded: number; streak: number; balance: number }
  >("claimDaily"),

  claimRewardCode: callable<{ code: string }, { awarded: number; balance: number }>(
    "claimRewardCode",
  ),

  listTasks: callable<void, { daily: TaskDoc[]; main: TaskDoc[]; partner: TaskDoc[] }>("listTasks"),
  startTaskSession: callable<{ taskId: string }, { sessionId: string; waitSeconds: number }>(
    "startTaskSession",
  ),
  claimTask: callable<
    { taskId: string; sessionId?: string },
    { awarded: number; balance: number }
  >("claimTask"),

  claimDailyTask: callable<{ key: string }, { awarded: number; balance: number }>("claimDailyTask"),

  listReferrals: callable<
    { cursor?: string | null },
    { rows: ReferralRow[]; nextCursor: string | null }
  >("listReferrals"),
  claimReferralEarnings: callable<{ idempotencyKey: string }, { awarded: number }>(
    "claimReferralEarnings",
  ),

  setWallet: callable<{ address: string }, { ok: true }>("setWallet"),
  requestWithdrawal: callable<
    { amountTokens: number; idempotencyKey: string },
    { id: string; netUsd: number }
  >("requestWithdrawal"),
  listWithdrawals: callable<
    { cursor?: string | null },
    { rows: WithdrawalDoc[]; nextCursor: string | null }
  >("listWithdrawals"),
  listLedger: callable<
    { cursor?: string | null },
    { rows: LedgerEntry[]; nextCursor: string | null }
  >("listLedger"),

  publicLeaderboard: callable<
    { cursor?: string | null },
    { rows: { name: string; earned: number; isMe: boolean }[]; myRank: number | null }
  >("publicLeaderboard"),
  publicPayouts: callable<
    { cursor?: string | null },
    {
      recent: { name: string; netUsd: number; paidAt: number }[];
      totalPaidUsd: number;
      pendingUsd: number;
    }
  >("publicPayouts"),

  updatePreferences: callable<
    { language?: string; notificationsEnabled?: boolean },
    { ok: true }
  >("updatePreferences"),

  adminLogin: callable<{ username: string; password: string }, { ok: true; expiresAt: number }>(
    "adminLogin",
  ),
  adminList: callable<
    { resource: string; cursor?: string | null; query?: string | null },
    { rows: Record<string, unknown>[]; nextCursor: string | null; stats?: Record<string, number> }
  >("adminList"),
  adminAction: callable<
    { action: string; payload: Record<string, unknown> },
    { ok: true; message?: string }
  >("adminAction"),
};

export function newIdempotencyKey(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rand}`;
}

/** Human readable message for a Firebase callable error. */
export function errorMessage(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const msg = err?.message ?? "Something went wrong";
  return msg.replace(/^.*?\/\s?/, "");
}
