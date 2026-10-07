/** Pure referral stage rules — shared by the server and covered by tests. */
export type ReferralStage = "pending" | "half" | "verified" | "fake";

export interface ReferralRuleConfig {
  referralStage1Ads: number;
  referralStage1Reward: number;
  referralStage2Ads: number;
  referralStage2Reward: number;
}

export interface ReferralState {
  stage: ReferralStage;
  earned: number;
  adsDay1: number;
  adsDay2: number;
}

/** Applies one verified ad view by the referred friend. Stages only move forward. */
export function advanceReferral(
  state: ReferralState,
  ageDays: number,
  cfg: ReferralRuleConfig,
): ReferralState & { potDelta: number } {
  if (state.stage === "fake" || state.stage === "verified") {
    return { ...state, potDelta: 0 };
  }
  const adsDay1 = state.adsDay1 + (ageDays < 1 ? 1 : 0);
  const adsDay2 = state.adsDay2 + (ageDays >= 1 ? 1 : 0);
  let stage: ReferralStage = state.stage;
  let earned = state.earned;
  let potDelta = 0;
  if (stage === "pending" && adsDay1 >= cfg.referralStage1Ads) {
    stage = "half";
    potDelta = cfg.referralStage1Reward;
  } else if (stage === "half" && adsDay2 >= cfg.referralStage2Ads) {
    stage = "verified";
    potDelta = cfg.referralStage2Reward;
  }
  earned += potDelta;
  return { stage, earned, adsDay1, adsDay2, potDelta };
}

export interface ReferralRankInput {
  referrerId: string;
  stage: ReferralStage;
}

/** Referral leaderboard: counts active (half/verified) friends; fake friends never count. */
export function rankReferrers(rows: ReferralRankInput[], limit = 50) {
  const map = new Map<string, { active: number; total: number }>();
  for (const r of rows) {
    if (r.stage === "fake") continue;
    const cur = map.get(r.referrerId) ?? { active: 0, total: 0 };
    cur.total += 1;
    if (r.stage === "half" || r.stage === "verified") cur.active += 1;
    map.set(r.referrerId, cur);
  }
  return [...map.entries()]
    .map(([referrerId, v]) => ({ referrerId, ...v }))
    .sort((a, b) => b.active - a.active || b.total - a.total)
    .slice(0, limit);
}
