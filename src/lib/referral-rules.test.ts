import { describe, expect, it } from "vitest";

import { advanceReferral, rankReferrers } from "./referral-rules";

const cfg = {
  referralStage1Ads: 10,
  referralStage1Reward: 400,
  referralStage2Ads: 15,
  referralStage2Reward: 600,
};

describe("advanceReferral", () => {
  it("moves pending to half on the 10th day-1 ad and pays 400", () => {
    const r = advanceReferral({ stage: "pending", earned: 200, adsDay1: 9, adsDay2: 0 }, 0, cfg);
    expect(r.stage).toBe("half");
    expect(r.potDelta).toBe(400);
    expect(r.earned).toBe(600);
  });

  it("stays pending before 10 day-1 ads", () => {
    const r = advanceReferral({ stage: "pending", earned: 200, adsDay1: 3, adsDay2: 0 }, 0, cfg);
    expect(r.stage).toBe("pending");
    expect(r.potDelta).toBe(0);
  });

  it("moves half to verified on the 15th day-2 ad and pays 600", () => {
    const r = advanceReferral({ stage: "half", earned: 600, adsDay1: 10, adsDay2: 14 }, 1, cfg);
    expect(r.stage).toBe("verified");
    expect(r.potDelta).toBe(600);
  });

  it("never pays fake referrals", () => {
    const r = advanceReferral({ stage: "fake", earned: 0, adsDay1: 50, adsDay2: 50 }, 0, cfg);
    expect(r.potDelta).toBe(0);
    expect(r.stage).toBe("fake");
  });
});

describe("rankReferrers", () => {
  it("ranks by active friends and ignores fake ones", () => {
    const ranked = rankReferrers([
      { referrerId: "a", stage: "fake" },
      { referrerId: "a", stage: "fake" },
      { referrerId: "b", stage: "verified" },
      { referrerId: "c", stage: "pending" },
      { referrerId: "c", stage: "pending" },
    ]);
    expect(ranked.map((r) => r.referrerId)).toEqual(["b", "c"]);
  });
});
