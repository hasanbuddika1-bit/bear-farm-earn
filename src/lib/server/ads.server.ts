import { db } from "./db.server";
import { loadConfig } from "./config.server";
import { award } from "./ledger.server";

export interface AdNetworkRow {
  id: string;
  name: string;
  provider: string;
  block_id: string | null;
  url: string | null;
  logo_url: string | null;
  reward: number;
  daily_limit: number;
  cooldown_secs: number;
  min_watch_secs: number;
  active: boolean;
  sort_order: number;
}

export const AD_NETWORK_COLUMNS =
  "id, name, provider, block_id, url, logo_url, reward, daily_limit, cooldown_secs, min_watch_secs, active, sort_order";

/**
 * Single place where an ad view turns into tokens. Used by the verified
 * in-app session flow and by the provider postback. Idempotent on
 * impressionId: a repeated call can never pay twice.
 */
export async function creditAdView(input: {
  userId: string;
  impressionId: string;
  network: string;
  reward: number;
}): Promise<{ credited: boolean; awarded: number }> {
  const client = db();
  const config = await loadConfig();
  if (!config.adsEnabled) return { credited: false, awarded: 0 };

  const reward = Math.min(1000, Math.max(1, Math.floor(input.reward)));
  const user = await client
    .from("users")
    .select("id, ads_watched, referred_by, suspended, created_at")
    .eq("id", input.userId)
    .maybeSingle();
  if (!user.data || user.data.suspended) return { credited: false, awarded: 0 };

  const impression = await client
    .from("ad_impressions")
    .insert({ id: input.impressionId, user_id: input.userId, reward, network: input.network });
  if (impression.error) return { credited: false, awarded: 0 };

  await client
    .from("users")
    .update({ ads_watched: Number(user.data.ads_watched) + 1 })
    .eq("id", input.userId);

  const result = await award({
    userId: input.userId,
    amount: reward,
    kind: "ads",
    label: "Watch ads reward",
    idempotencyKey: `ad:${input.impressionId}`,
  });

  await progressReferral(input.userId, user.data.referred_by as string | null, user.data.created_at as string);
  return { credited: true, awarded: result.awarded };
}

/** Referral stages only move forward through verified ad views. */
async function progressReferral(userId: string, referredBy: string | null, createdAt: string) {
  if (!referredBy) return;
  const client = db();
  const config = await loadConfig();
  const ref = await client
    .from("referrals")
    .select("id, referrer_id, stage, earned, ads_day1, ads_day2")
    .eq("referred_id", userId)
    .maybeSingle();
  if (!ref.data) return;
  const stageNow = ref.data.stage as string;
  if (stageNow === "fake" || stageNow === "verified") return;

  const ageDays = Math.floor((Date.now() - Date.parse(createdAt)) / 86_400_000);
  const day1 = Number(ref.data.ads_day1) + (ageDays < 1 ? 1 : 0);
  const day2 = Number(ref.data.ads_day2) + (ageDays >= 1 ? 1 : 0);

  let stage = stageNow;
  let earned = Number(ref.data.earned);
  let potDelta = 0;
  if (stage === "pending" && day1 >= config.referralStage1Ads) {
    stage = "half";
    earned += config.referralStage1Reward;
    potDelta = config.referralStage1Reward;
  } else if (stage === "half" && day2 >= config.referralStage2Ads) {
    stage = "verified";
    earned += config.referralStage2Reward;
    potDelta = config.referralStage2Reward;
  }

  await client
    .from("referrals")
    .update({ stage, earned, ads_day1: day1, ads_day2: day2, updated_at: new Date().toISOString() })
    .eq("id", ref.data.id as number);

  if (potDelta > 0) {
    const referrer = await client
      .from("users")
      .select("referral_pot")
      .eq("id", ref.data.referrer_id as string)
      .single();
    await client
      .from("users")
      .update({ referral_pot: Number(referrer.data?.referral_pot ?? 0) + potDelta })
      .eq("id", ref.data.referrer_id as string);
  }
}
