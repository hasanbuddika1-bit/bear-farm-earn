import { describe, expect, it } from "vitest";
import { BOT_USERNAME, BOT_MINI_APP_URL, BOT_REFERRAL_PREFIX } from "./bot-config";

describe("Bear Farm bot identity", () => {
  it("uses the requested replacement bot", () => {
    expect(BOT_USERNAME).toBe("BEAR_FARM_1_BOT");
  });
  it("opens the replacement mini app", () => {
    expect(BOT_MINI_APP_URL).toBe("https://t.me/BEAR_FARM_1_BOT/bear_earn");
  });
  it("passes referral codes to the replacement bot", () => {
    expect(`${BOT_REFERRAL_PREFIX}12345`).toBe("https://t.me/BEAR_FARM_1_BOT/bear_earn?startapp=12345");
  });
});