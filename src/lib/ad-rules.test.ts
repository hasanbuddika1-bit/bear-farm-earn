import { describe, expect, it } from "vitest";
import { adRewardForIndex, DEFAULT_AD_REWARD_STEPS, withdrawBlockers } from "./ad-rules";

describe("ad rewards per card", () => {
  it("pays 100, 80, 70, 60, 50 for ads 1-5", () => {
    expect([0, 1, 2, 3, 4].map((i) => adRewardForIndex(DEFAULT_AD_REWARD_STEPS, i))).toEqual([
      100, 80, 70, 60, 50,
    ]);
  });
  it("stops after 5 ads", () => {
    expect(adRewardForIndex(DEFAULT_AD_REWARD_STEPS, 5)).toBeNull();
  });
});

describe("withdraw requirements", () => {
  const ok = { mainTotal: 3, mainDone: 3, adsToday: 10, activeReferrals: 2 };
  it("allows when all main tasks, 10 ads today and 2 referrals are done", () => {
    expect(withdrawBlockers(ok)).toEqual([]);
  });
  it("blocks with 9 ads today", () => {
    expect(withdrawBlockers({ ...ok, adsToday: 9 })).toHaveLength(1);
  });
  it("blocks with 1 referral", () => {
    expect(withdrawBlockers({ ...ok, activeReferrals: 1 })).toHaveLength(1);
  });
  it("blocks with an unfinished main task", () => {
    expect(withdrawBlockers({ ...ok, mainDone: 2 })).toHaveLength(1);
  });
});
