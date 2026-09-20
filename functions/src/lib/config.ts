import { col } from "./init";

export interface AppConfig {
  tokenName: string;
  tokenSymbol: string;
  miningRewardPerCycle: number;
  miningCycleMinutes: number;
  dailyRewards: number[];
  dailyTaskCommunityReward: number;
  dailyTaskPaymentReward: number;
  dailyReferralTaskReward: number;
  referralJoinReward: number;
  referralStage1Reward: number;
  referralStage2Reward: number;
  referralStage1Ads: number;
  referralStage2Ads: number;
  tokensPerUsd: number;
  firstWithdrawMinTokens: number;
  nextWithdrawMinTokens: number;
  withdrawFeeFlatUsd: number;
  withdrawFeePercent: number;
  communityChannelUrl: string;
  paymentChannelUrl: string;
  communityChatId: string;
  paymentChatId: string;
  botUsername: string;
  referralLink: string;
  adsEnabled: boolean;
  maintenance: boolean;
}

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
  communityChatId: "@bearfarmCommunity",
  paymentChatId: "@bearfarm_pay_out",
  botUsername: "Bear_Farmbot",
  referralLink: "https://t.me/Bear_Farmbot?start=",
  adsEnabled: true,
  maintenance: false,
};

/** Numeric config keys an admin may change, with hard server-side bounds. */
export const CONFIG_BOUNDS: Record<string, [number, number]> = {
  miningRewardPerCycle: [1, 100000],
  miningCycleMinutes: [5, 1440],
  dailyTaskCommunityReward: [0, 100000],
  dailyTaskPaymentReward: [0, 100000],
  dailyReferralTaskReward: [0, 100000],
  referralJoinReward: [0, 100000],
  referralStage1Reward: [0, 100000],
  referralStage2Reward: [0, 100000],
  referralStage1Ads: [1, 1000],
  referralStage2Ads: [1, 1000],
  tokensPerUsd: [1, 100000000],
  firstWithdrawMinTokens: [1, 100000000],
  nextWithdrawMinTokens: [1, 100000000],
  withdrawFeeFlatUsd: [0, 100],
  withdrawFeePercent: [0, 50],
};

export async function getConfig(): Promise<AppConfig> {
  const snap = await col.config().get();
  const stored = snap.exists ? (snap.data() as Partial<AppConfig>) : {};
  return { ...DEFAULT_CONFIG, ...stored };
}

/** Config the client is allowed to see (chat ids stay server side). */
export function publicConfig(config: AppConfig) {
  const { communityChatId: _c, paymentChatId: _p, ...rest } = config;
  return rest;
}

export function withdrawalMath(
  amountTokens: number,
  config: Pick<AppConfig, "tokensPerUsd" | "withdrawFeeFlatUsd" | "withdrawFeePercent">,
) {
  const grossUsd = amountTokens / config.tokensPerUsd;
  const feeUsd =
    Math.round((config.withdrawFeeFlatUsd + (grossUsd * config.withdrawFeePercent) / 100) * 1e6) /
    1e6;
  const netUsd = Math.max(0, Math.round((grossUsd - feeUsd) * 1e6) / 1e6);
  return { grossUsd, feeUsd, netUsd };
}

/** UTC day key used by daily rewards and daily tasks. */
export function utcDayKey(ms = Date.now()) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function previousUtcDayKey(dayKey: string) {
  const ms = Date.parse(`${dayKey}T00:00:00.000Z`) - 86400000;
  return utcDayKey(ms);
}

/**
 * Streak rules: consecutive UTC day continues the streak, same day is blocked
 * (returns null), and any missed day restarts at day 1.
 */
export function nextStreak(
  lastClaimDay: string | null,
  currentStreak: number,
  today: string,
  cycleLength: number,
): number | null {
  if (!lastClaimDay) return 1;
  if (lastClaimDay === today) return null;
  if (lastClaimDay !== previousUtcDayKey(today)) return 1;
  return currentStreak >= cycleLength ? 1 : currentStreak + 1;
}
