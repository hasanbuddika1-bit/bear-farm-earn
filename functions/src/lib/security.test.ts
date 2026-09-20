import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyInitData } from "./telegram";
import { nextStreak, previousUtcDayKey, utcDayKey, withdrawalMath, DEFAULT_CONFIG } from "./config";

const BOT_TOKEN = "123456:test-bot-token";

function signInitData(fields: Record<string, string>, token = BOT_TOKEN) {
  const check = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const validFields = () => ({
  auth_date: String(Math.floor(Date.now() / 1000)),
  query_id: "AAA",
  user: JSON.stringify({ id: 777, username: "farmer", first_name: "Bear" }),
});

describe("Telegram initData verification", () => {
  it("accepts a correctly signed payload", () => {
    const user = verifyInitData(signInitData(validFields()), BOT_TOKEN);
    expect(user.id).toBe(777);
    expect(user.username).toBe("farmer");
  });

  it("rejects a tampered user id", () => {
    const signed = signInitData(validFields());
    const tampered = signed.replace("777", "888");
    expect(() => verifyInitData(tampered, BOT_TOKEN)).toThrow();
  });

  it("rejects a payload signed with another bot token", () => {
    const signed = signInitData(validFields(), "999:attacker");
    expect(() => verifyInitData(signed, BOT_TOKEN)).toThrow();
  });

  it("rejects an expired session", () => {
    const fields = { ...validFields(), auth_date: String(Math.floor(Date.now() / 1000) - 7200) };
    expect(() => verifyInitData(signInitData(fields), BOT_TOKEN)).toThrow();
  });

  it("rejects a missing signature", () => {
    expect(() => verifyInitData("user=%7B%22id%22%3A1%7D&auth_date=1", BOT_TOKEN)).toThrow();
  });
});

describe("withdrawal math", () => {
  it("charges the flat fee plus the percentage", () => {
    const { grossUsd, feeUsd, netUsd } = withdrawalMath(100000, DEFAULT_CONFIG);
    expect(grossUsd).toBe(1);
    expect(feeUsd).toBeCloseTo(0.06, 6);
    expect(netUsd).toBeCloseTo(0.94, 6);
  });

  it("never returns a negative payout", () => {
    const { netUsd } = withdrawalMath(1, DEFAULT_CONFIG);
    expect(netUsd).toBeGreaterThanOrEqual(0);
  });
});

describe("daily streak rules", () => {
  const today = utcDayKey();
  const yesterday = previousUtcDayKey(today);

  it("starts at day 1", () => {
    expect(nextStreak(null, 0, today, 7)).toBe(1);
  });

  it("blocks a second claim on the same day", () => {
    expect(nextStreak(today, 3, today, 7)).toBeNull();
  });

  it("continues after a consecutive day", () => {
    expect(nextStreak(yesterday, 3, today, 7)).toBe(4);
  });

  it("restarts after a missed day", () => {
    expect(nextStreak("2020-01-01", 6, today, 7)).toBe(1);
  });

  it("wraps back to day 1 after the full cycle", () => {
    expect(nextStreak(yesterday, 7, today, 7)).toBe(1);
  });
});
