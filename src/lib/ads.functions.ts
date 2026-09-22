import { createServerFn } from "@tanstack/react-start";

import type { AdNetworkDoc } from "./types";

const tokenInput = (input: { token: string }) => ({ token: String(input?.token ?? "") });

/** Networks the user can watch right now, with server-computed limits. */
export const listAdNetworks = createServerFn({ method: "POST" })
  .inputValidator(tokenInput)
  .handler(async ({ data }): Promise<{ networks: AdNetworkDoc[]; adsEnabled: boolean; watchedToday: number }> => {
    const { requireUser } = await import("./server/user.server");
    const { loadConfig } = await import("./server/config.server");
    const { AD_NETWORK_COLUMNS, type AdNetworkRow } = await import("./server/ads.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    const config = await loadConfig();
    const client = db();
    const dayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();

    const [nets, impressions] = await Promise.all([
      client
        .from("ad_networks")
        .select(AD_NETWORK_COLUMNS)
        .eq("active", true)
        .order("sort_order", { ascending: true }),
      client
        .from("ad_impressions")
        .select("network, created_at")
        .eq("user_id", row.id)
        .gte("created_at", dayStart),
    ]);

    const perNetwork = new Map<string, number>();
    const lastAt = new Map<string, number>();
    for (const imp of impressions.data ?? []) {
      const key = (imp.network as string) ?? "unknown";
      perNetwork.set(key, (perNetwork.get(key) ?? 0) + 1);
      const at = Date.parse(imp.created_at as string);
      if (at > (lastAt.get(key) ?? 0)) lastAt.set(key, at);
    }

    const networks: AdNetworkDoc[] = ((nets.data ?? []) as unknown as AdNetworkRow[]).map((n) => {
      const used = perNetwork.get(n.id) ?? 0;
      const cooldownLeft = Math.max(
        0,
        Math.ceil(((lastAt.get(n.id) ?? 0) + n.cooldown_secs * 1000 - Date.now()) / 1000),
      );
      return {
        id: n.id,
        name: n.name,
        provider: n.provider as AdNetworkDoc["provider"],
        blockId: n.block_id ?? "",
        url: n.url ?? "",
        logoUrl: n.logo_url ?? "",
        reward: Number(n.reward),
        dailyLimit: Number(n.daily_limit),
        watchedToday: used,
        remainingToday: Math.max(0, Number(n.daily_limit) - used),
        minWatchSecs: Number(n.min_watch_secs),
        cooldownLeft,
      };
    });

    return {
      networks,
      adsEnabled: config.adsEnabled,
      watchedToday: [...perNetwork.values()].reduce((a, b) => a + b, 0),
    };
  });

/** Opens a server-side watch session. Nothing is paid here. */
export const startAdSession = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; networkId: string }) => ({
    token: String(input?.token ?? ""),
    networkId: String(input?.networkId ?? "").slice(0, 40),
  }))
  .handler(
    async ({
      data,
    }): Promise<{ sessionId: string; waitSeconds: number; provider: string; blockId: string; url: string }> => {
      const { requireUser } = await import("./server/user.server");
      const { loadConfig } = await import("./server/config.server");
      const { rateLimit } = await import("./server/session.server");
      const { AD_NETWORK_COLUMNS, type AdNetworkRow } = await import("./server/ads.server");
      const { db } = await import("./server/db.server");

      const { row } = await requireUser(data.token);
      await rateLimit(`adstart:${row.id}`, 60, 3600);
      const config = await loadConfig();
      if (!config.adsEnabled) throw new Error("Ads are paused right now.");

      const client = db();
      const net = await client
        .from("ad_networks")
        .select(AD_NETWORK_COLUMNS)
        .eq("id", data.networkId)
        .eq("active", true)
        .maybeSingle();
      if (!net.data) throw new Error("This ad network is not available.");
      const n = net.data as unknown as AdNetworkRow;

      const dayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").toISOString();
      const used = await client
        .from("ad_impressions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", row.id)
        .eq("network", n.id)
        .gte("created_at", dayStart);
      if ((used.count ?? 0) >= Number(n.daily_limit)) {
        throw new Error("Daily limit reached for this network. Come back tomorrow.");
      }

      const last = await client
        .from("ad_impressions")
        .select("created_at")
        .eq("user_id", row.id)
        .eq("network", n.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last.data) {
        const left = Date.parse(last.data.created_at as string) + n.cooldown_secs * 1000 - Date.now();
        if (left > 0) throw new Error(`Please wait ${Math.ceil(left / 1000)}s before the next ad.`);
      }

      const wait = Math.min(120, Math.max(5, Number(n.min_watch_secs)));
      const readyAt = Date.now() + wait * 1000;
      const session = await client
        .from("ad_sessions")
        .insert({
          user_id: row.id,
          network: n.id,
          reward: Number(n.reward),
          ready_at: new Date(readyAt).toISOString(),
          expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        })
        .select("id")
        .single();
      if (session.error || !session.data) throw new Error("Could not start the ad. Try again.");

      return {
        sessionId: session.data.id as string,
        waitSeconds: wait,
        provider: n.provider,
        blockId: n.block_id ?? "",
        url: n.url ?? "",
      };
    },
  );

/** Pays a session out once — and only after the server-side timer elapsed. */
export const claimAdSession = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; sessionId: string }) => ({
    token: String(input?.token ?? ""),
    sessionId: String(input?.sessionId ?? "").slice(0, 64),
  }))
  .handler(async ({ data }): Promise<{ awarded: number }> => {
    const { requireUser } = await import("./server/user.server");
    const { rateLimit } = await import("./server/session.server");
    const { creditAdView } = await import("./server/ads.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`adclaim:${row.id}`, 60, 3600);
    const client = db();

    // Consume atomically: only an unconsumed, own, ready, unexpired session wins.
    const claimed = await client
      .from("ad_sessions")
      .update({ consumed: true })
      .eq("id", data.sessionId)
      .eq("user_id", row.id)
      .eq("consumed", false)
      .lte("ready_at", new Date().toISOString())
      .gte("expires_at", new Date().toISOString())
      .select("id, network, reward")
      .maybeSingle();
    if (!claimed.data) throw new Error("Watch the full ad first, then claim.");

    const result = await creditAdView({
      userId: row.id,
      impressionId: `sess:${claimed.data.id as string}`,
      network: claimed.data.network as string,
      reward: Number(claimed.data.reward),
    });
    if (!result.credited) throw new Error("This ad view was already counted.");
    return { awarded: result.awarded };
  });
