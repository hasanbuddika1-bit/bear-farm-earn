import { bootstrap as bootstrapFn, me as meFn, telegramAuth as telegramAuthFn } from "./auth.functions";
import {
  claimDaily as claimDailyFn,
  claimMining as claimMiningFn,
  claimRewardCode as claimRewardCodeFn,
  claimTask as claimTaskFn,
  listTasks as listTasksFn,
  startMining as startMiningFn,
  startTaskSession as startTaskSessionFn,
} from "./farm.functions";
import {
  claimReferralEarnings as claimReferralEarningsFn,
  listReferrals as listReferralsFn,
} from "./referral.functions";
import {
  listLedger as listLedgerFn,
  listWithdrawals as listWithdrawalsFn,
  requestWithdrawal as requestWithdrawalFn,
  setWallet as setWalletFn,
  updatePreferences as updatePreferencesFn,
} from "./wallet.functions";
import { publicLeaderboard as publicLeaderboardFn, publicPayouts as publicPayoutsFn } from "./public.functions";
import {
  adminAction as adminActionFn,
  adminList as adminListFn,
  adminLogin as adminLoginFn,
} from "./admin.functions";
import {
  getAdminToken,
  getSessionToken,
  notifyBalanceChanged,
  setAdminToken,
  setSessionToken,
} from "./session";
import type { AppConfig, LedgerEntry, ReferralRow, TaskDoc, UserDoc, WithdrawalDoc } from "./types";

/**
 * Client-facing API. Every entry point is a server function: the browser never
 * touches the database, so balances can only change on the server.
 */
export const api = {
  async telegramAuth(input: { initData: string; startParam?: string | null; deviceId: string }) {
    const result = await telegramAuthFn({ data: input });
    setSessionToken(result.token);
    return result;
  },

  async bootstrap(): Promise<{ config: AppConfig; serverTime: number; user: UserDoc }> {
    return bootstrapFn({ data: { token: getSessionToken() } });
  },

  async me(): Promise<UserDoc> {
    return meFn({ data: { token: getSessionToken() } });
  },

  async startMining(): Promise<{ endsAt: number }> {
    const user = await startMiningFn({ data: { token: getSessionToken() } });
    notifyBalanceChanged();
    return { endsAt: user.mining.endsAt ?? 0 };
  },

  async claimMining(input: { idempotencyKey: string }): Promise<{ awarded: number; balance: number }> {
    const result = await claimMiningFn({
      data: { token: getSessionToken(), idempotencyKey: input.idempotencyKey },
    });
    notifyBalanceChanged();
    return { awarded: result.awarded, balance: result.user.balance };
  },

  async claimDaily(_input: { idempotencyKey: string }): Promise<{
    awarded: number;
    streak: number;
    balance: number;
  }> {
    const result = await claimDailyFn({ data: { token: getSessionToken() } });
    notifyBalanceChanged();
    return { awarded: result.awarded, streak: result.streak, balance: result.user.balance };
  },

  async claimRewardCode(input: { code: string }) {
    const result = await claimRewardCodeFn({ data: { token: getSessionToken(), code: input.code } });
    notifyBalanceChanged();
    return result;
  },

  async listTasks(): Promise<{ daily: TaskDoc[]; main: TaskDoc[]; partner: TaskDoc[] }> {
    return listTasksFn({ data: { token: getSessionToken() } });
  },

  async startTaskSession(input: { taskId: string }): Promise<{ sessionId: string; waitSeconds: number }> {
    const result = await startTaskSessionFn({
      data: { token: getSessionToken(), taskId: input.taskId },
    });
    return {
      sessionId: input.taskId,
      waitSeconds: Math.max(0, Math.ceil((result.readyAt - Date.now()) / 1000)),
    };
  },

  async claimTask(input: { taskId: string; sessionId?: string }) {
    const result = await claimTaskFn({ data: { token: getSessionToken(), taskId: input.taskId } });
    notifyBalanceChanged();
    return result;
  },

  async claimDailyTask(input: { key: string }) {
    const result = await claimTaskFn({ data: { token: getSessionToken(), taskId: input.key } });
    notifyBalanceChanged();
    return result;
  },

  async listReferrals(_input: { cursor?: string | null } = {}): Promise<{
    rows: ReferralRow[];
    nextCursor: string | null;
    total: number;
    active: number;
    unclaimed: number;
    totalEarned: number;
    link: string;
  }> {
    const result = await listReferralsFn({ data: { token: getSessionToken() } });
    return { ...result, nextCursor: null };
  },

  async claimReferralEarnings(input: { idempotencyKey: string }) {
    const result = await claimReferralEarningsFn({
      data: { token: getSessionToken(), idempotencyKey: input.idempotencyKey },
    });
    notifyBalanceChanged();
    return result;
  },

  async setWallet(input: { address: string }): Promise<{ ok: true }> {
    await setWalletFn({ data: { token: getSessionToken(), address: input.address } });
    notifyBalanceChanged();
    return { ok: true };
  },

  async requestWithdrawal(input: { amountTokens: number; idempotencyKey: string }) {
    const result = await requestWithdrawalFn({
      data: {
        token: getSessionToken(),
        tokens: input.amountTokens,
        idempotencyKey: input.idempotencyKey,
      },
    });
    notifyBalanceChanged();
    return result;
  },

  async listWithdrawals(
    _input: { cursor?: string | null } = {},
  ): Promise<{ rows: WithdrawalDoc[]; nextCursor: string | null }> {
    const rows = await listWithdrawalsFn({ data: { token: getSessionToken() } });
    return { rows, nextCursor: null };
  },

  async listLedger(
    input: { cursor?: string | null } = {},
  ): Promise<{ rows: LedgerEntry[]; nextCursor: string | null }> {
    const result = await listLedgerFn({
      data: { token: getSessionToken(), cursor: input.cursor ?? null },
    });
    return { rows: result.entries, nextCursor: result.nextCursor };
  },

  async publicLeaderboard(_input: { cursor?: string | null } = {}): Promise<{
    rows: { name: string; earned: number; isMe: boolean }[];
    myRank: number | null;
  }> {
    const result = await publicLeaderboardFn({ data: { token: getSessionToken() || null } });
    return {
      rows: result.rows.map((r) => ({ name: r.name, earned: r.balance, isMe: Boolean(r.isMe) })),
      myRank: result.myRank,
    };
  },

  async publicPayouts(_input: { cursor?: string | null } = {}): Promise<{
    recent: { name: string; netUsd: number; paidAt: number }[];
    totalPaidUsd: number;
    pendingUsd: number;
  }> {
    const result = await publicPayoutsFn();
    return {
      recent: result.recent,
      totalPaidUsd: result.totalPaidUsd,
      pendingUsd: result.pendingCount,
    };
  },

  async updatePreferences(input: { language?: string; notificationsEnabled?: boolean }): Promise<{ ok: true }> {
    await updatePreferencesFn({ data: { token: getSessionToken(), ...input } });
    notifyBalanceChanged();
    return { ok: true };
  },

  async adminLogin(input: { username: string; password: string }): Promise<{ ok: true; expiresAt: number }> {
    const result = await adminLoginFn({
      data: { token: getSessionToken(), username: input.username, password: input.password },
    });
    setAdminToken(result.adminToken);
    return { ok: true, expiresAt: result.expiresAt };
  },

  async adminList(input: { resource: string; cursor?: string | null; query?: string | null }) {
    return adminListFn({
      data: {
        token: getSessionToken(),
        adminToken: getAdminToken(),
        resource: input.resource,
        query: input.query ?? null,
      },
    });
  },

  async adminAction(input: { action: string; payload: Record<string, unknown> }) {
    const result = await adminActionFn({
      data: {
        token: getSessionToken(),
        adminToken: getAdminToken(),
        action: input.action,
        payload: input.payload,
      },
    });
    notifyBalanceChanged();
    return result;
  },
};

export function newIdempotencyKey(prefix: string) {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${rand}`;
}

/** Human readable message for a server error. */
export function errorMessage(error: unknown): string {
  const err = error as { message?: string };
  const msg = err?.message ?? "Something went wrong";
  return msg.replace(/^.*?\/\s?/, "").slice(0, 200);
}
