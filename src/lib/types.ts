export type TaskKind = "telegram_channel" | "mini_app" | "link";
export type TaskGroup = "main" | "partner";

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
  botUsername: string;
  referralLink: string;
  adsEnabled: boolean;
  maintenance: boolean;
}

export interface UserDoc {
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  balance: number;
  totalEarned: number;
  suspended: boolean;
  suspendedReason?: string | null;
  walletAddress: string | null;
  referralCode: string;
  referredBy: number | null;
  referralCount: number;
  activeReferralCount: number;
  referralPendingReward: number;
  referralTotalEarned: number;
  adsWatchedTotal: number;
  language: string;
  notificationsEnabled: boolean;
  isAdmin?: boolean;
  mining: {
    active: boolean;
    startedAt: number | null;
    endsAt: number | null;
    claimable: boolean;
  };
  daily: {
    streak: number;
    lastClaimDay: string | null;
  };
  createdAt: number;
}

export interface BootstrapResult {
  config: AppConfig;
  serverTime: number;
}

export interface TaskDoc {
  id: string;
  group: TaskGroup;
  kind: TaskKind;
  title: string;
  description: string;
  url: string;
  chatId?: string | null;
  reward: number;
  active: boolean;
  claimed?: boolean;
}

export interface LedgerEntry {
  id: string;
  type: string;
  label: string;
  amount: number;
  status: string;
  note?: string;
  createdAt: number;
}

export interface WithdrawalDoc {
  id: string;
  number: number;
  amountTokens: number;
  feeUsd: number;
  netUsd: number;
  address: string;
  status: "pending" | "approved" | "rejected";
  txId?: string | null;
  createdAt: number;
  reviewedAt?: number | null;
  rejectReason?: string | null;
}

export interface ReferralRow {
  id: string;
  name: string;
  stage: "pending" | "half" | "verified" | "fake";
  earned: number;
  adsWatched: number;
  createdAt: number;
}
