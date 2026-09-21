import type { AppConfig } from "../types";
import { db } from "./db.server";

export const DEFAULT_CONFIG: AppConfig = {
  tokenName: "Bear Farm Token",
  tokenSymbol: "BFT",
  miningRewardPerCycle: 100,
  miningCycleMinutes: 60,
  dailyRewards: [30, 40, 50, 70, 90, 120, 150],
  dailyTaskCommunityReward: 50,
  dailyTaskPaymentReward: 50,
  dailyReferralTaskReward: 250,
  referralJoinReward: 200,
  referralStage1Reward: 400,
  referralStage2Reward: 600,
  referralStage1Ads: 10,
  referralStage2Ads: 15,
  tokensPerUsd: 100000,
  firstWithdrawMinTokens: 10000,
  nextWithdrawMinTokens: 20000,
  withdrawFeeFlatUsd: 0.01,
  withdrawFeePercent: 5,
  communityChannelUrl: "https://t.me/bearfarmCommunity",
  paymentChannelUrl: "https://t.me/bearfarm_pay_out",
  botUsername: "Bear_Farmbot",
  referralLink: "https://t.me/Bear_Farmbot?start=",
  adsEnabled: true,
  maintenance: false,
};

/** Numeric guard rails so a bad admin edit can never break the economy. */
export const CONFIG_BOUNDS: Record<string, [number, number]> = {
  miningRewardPerCycle: [1, 100000],
  miningCycleMinutes: [5, 1440],
  dailyTaskCommunityReward: [0, 10000],
  dailyTaskPaymentReward: [0, 10000],
  dailyReferralTaskReward: [0, 100000],
  referralJoinReward: [0, 100000],
  referralStage1Reward: [0, 100000],
  referralStage2Reward: [0, 100000],
  referralStage1Ads: [1, 500],
  referralStage2Ads: [1, 500],
  tokensPerUsd: [1000, 10000000],
  firstWithdrawMinTokens: [100, 10000000],
  nextWithdrawMinTokens: [100, 10000000],
  withdrawFeeFlatUsd: [0, 10],
  withdrawFeePercent: [0, 50],
};

let cache: { value: AppConfig; at: number } | null = null;
const TTL_MS = 60_000;

export async function loadConfig(): Promise<AppConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const { data } = await db().from("app_config").select("data").eq("id", "default").maybeSingle();
  const stored = (data?.data ?? {}) as Partial<AppConfig>;
  const value = { ...DEFAULT_CONFIG, ...stored };
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateConfigCache() {
  cache = null;
}

export function withdrawalMath(tokens: number, config: AppConfig) {
  const grossUsd = tokens / config.tokensPerUsd;
  const feeUsd =
    Math.round((config.withdrawFeeFlatUsd + (grossUsd * config.withdrawFeePercent) / 100) * 10000) /
    10000;
  const netUsd = Math.max(0, Math.round((grossUsd - feeUsd) * 10000) / 10000);
  return { grossUsd: Math.round(grossUsd * 10000) / 10000, feeUsd, netUsd };
}

export function utcDayKey(at = Date.now()) {
  return new Date(at).toISOString().slice(0, 10);
}

export function previousUtcDayKey(at = Date.now()) {
  return utcDayKey(at - 86_400_000);
}

/** null = already claimed today. Missed a day ⇒ restart at 1. */
export function nextStreak(
  lastClaimDay: string | null,
  currentStreak: number,
  today: string,
  cycleLength: number,
): number | null {
  if (lastClaimDay === today) return null;
  if (!lastClaimDay) return 1;
  const yesterday = previousUtcDayKey(Date.parse(`${today}T00:00:00Z`));
  if (lastClaimDay !== yesterday) return 1;
  if (currentStreak >= cycleLength) return 1;
  return currentStreak + 1;
}
