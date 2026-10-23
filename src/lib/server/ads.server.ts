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
  const { advanceReferral } = await import("../referral-rules");
  const next = advanceReferral(
    {
      stage: stageNow as "pending" | "half",
      earned: Number(ref.data.earned),
      adsDay1: Number(ref.data.ads_day1),
      adsDay2: Number(ref.data.ads_day2),
    },
    ageDays,
    config,
  );

  // Only one concurrent ad view may advance the stage (guard on the old stage).
  const updated = await client
    .from("referrals")
    .update({
      stage: next.stage,
      earned: next.earned,
      ads_day1: next.adsDay1,
      ads_day2: next.adsDay2,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ref.data.id as number)
    .eq("stage", stageNow)
    .select("id");

  if (next.potDelta > 0 && updated.data && updated.data.length > 0) {
    const { addReferralPot } = await import("./referral.server");
    await addReferralPot(ref.data.referrer_id as string, next.potDelta);
  }
}

let seeded = false;
/**
 * One-time setup of the Adsgram cards (same as db/0003), applied by the server
 * itself so no manual SQL is needed. A flag in app_config makes it run once,
 * so cards the admin later removes are never re-added.
 */
export async function ensureAdsgramCards(): Promise<void> {
  if (seeded) return;
  const client = db();
  const cfg = await client.from("app_config").select("data").eq("id", "default").maybeSingle();
  const data = (cfg.data?.data ?? {}) as Record<string, unknown>;
  if (data["adsSeedVersion"] === 3) {
    seeded = true;
    return;
  }
  const card = (id: string, name: string, block: string, sort: number) => ({
    id, name, provider: "adsgram", block_id: block, url: null, logo_url: null,
    reward: 100, daily_limit: 5, cooldown_secs: 10, min_watch_secs: 3, active: true, sort_order: sort,
  });
  const res = await client.from("ad_networks").upsert(
    [
      card("adsgram_reward", "🎁 Golden Reward", "55403", 1),
      card("adsgram_int", "🌾 Harvest Video", "int-55404", 2),
      card("adsgram_reward_2", "🍯 Honey Bonus", "55403", 3),
      card("adsgram_int_2", "🐻 Bear Boost", "int-55404", 4),
      card("monetag", "🌻 Sunflower Ads", "55403", 5),
      card("gigapub", "🥕 Carrot Ads", "int-55404", 6),
    ],
    { onConflict: "id" },
  );
  if (res.error) return;
  await client
    .from("app_config")
    .upsert({ id: "default", data: { ...data, adsSeedVersion: 3 }, updated_at: new Date().toISOString() });
  const { invalidateConfigCache } = await import("./config.server");
  invalidateConfigCache();
  seeded = true;
}
