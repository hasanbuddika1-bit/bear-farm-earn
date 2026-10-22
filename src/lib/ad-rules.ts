/** Pure ad + withdrawal-requirement rules (tested in ad-rules.test.ts). */

export const DEFAULT_AD_REWARD_STEPS = [100, 80, 70, 60, 50];
export const WITHDRAW_MIN_ADS_TODAY = 10;
export const WITHDRAW_MIN_ACTIVE_REFERRALS = 2;

/** Reward for the next ad on a card, or null when the card is used up today. */
export function adRewardForIndex(steps: number[], watchedToday: number): number | null {
  if (watchedToday < 0 || watchedToday >= steps.length) return null;
  const v = Math.floor(Number(steps[watchedToday]));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export interface WithdrawProgress {
  mainTotal: number;
  mainDone: number;
  adsToday: number;
  activeReferrals: number;
}

export function withdrawBlockers(p: WithdrawProgress): string[] {
  const out: string[] = [];
  if (p.mainDone < p.mainTotal) out.push(`Complete all main tasks (${p.mainDone}/${p.mainTotal}).`);
  if (p.adsToday < WITHDRAW_MIN_ADS_TODAY)
    out.push(`Watch ${WITHDRAW_MIN_ADS_TODAY} ads today (${p.adsToday}/${WITHDRAW_MIN_ADS_TODAY}).`);
  if (p.activeReferrals < WITHDRAW_MIN_ACTIVE_REFERRALS)
    out.push(
      `Invite ${WITHDRAW_MIN_ACTIVE_REFERRALS} active friends (${p.activeReferrals}/${WITHDRAW_MIN_ACTIVE_REFERRALS}).`,
    );
  return out;
}
