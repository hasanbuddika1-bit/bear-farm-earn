import { createFileRoute } from "@tanstack/react-router";

/**
 * Ad reward postback. Only the ad provider can call this: every request must
 * carry an HMAC signature over the payload made with BEARFARM_ADS_SECRET.
 * The client never credits an ad view itself.
 */
export const Route = createFileRoute("/api/public/ads-postback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { db } = await import("@/lib/server/db.server");
        const { loadConfig } = await import("@/lib/server/config.server");
        const { award } = await import("@/lib/server/ledger.server");

        const secret = process.env["BEARFARM_ADS_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });

        const body = await request.text();
        if (body.length > 4096) return new Response("payload too large", { status: 413 });
        const provided = request.headers.get("x-bearfarm-signature") ?? "";

        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
        const expected = [...new Uint8Array(sig)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        if (provided.length !== expected.length) {
          return new Response("invalid signature", { status: 401 });
        }
        let diff = 0;
        for (let i = 0; i < expected.length; i++) {
          diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
        }
        if (diff !== 0) return new Response("invalid signature", { status: 401 });

        let payload: { telegramId?: string | number; impressionId?: string; reward?: number };
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("bad json", { status: 400 });
        }
        const telegramId = String(payload.telegramId ?? "").slice(0, 32);
        const impressionId = String(payload.impressionId ?? "").slice(0, 120);
        if (!telegramId || !impressionId) return new Response("missing fields", { status: 400 });

        const client = db();
        const config = await loadConfig();
        if (!config.adsEnabled) return new Response("ads disabled", { status: 403 });

        const user = await client
          .from("users")
          .select("id, ads_watched, referred_by, suspended, created_at")
          .eq("telegram_id", telegramId)
          .maybeSingle();
        if (!user.data || user.data.suspended) return new Response("no user", { status: 404 });

        const reward = Math.min(50, Math.max(1, Math.floor(Number(payload.reward ?? 10))));
        const impression = await client
          .from("ad_impressions")
          .insert({ id: impressionId, user_id: user.data.id as string, reward });
        if (impression.error) return new Response("ok", { status: 200 }); // duplicate = no-op

        await client
          .from("users")
          .update({ ads_watched: Number(user.data.ads_watched) + 1 })
          .eq("id", user.data.id as string);

        await award({
          userId: user.data.id as string,
          amount: reward,
          kind: "ads",
          label: "Watch ads reward",
          idempotencyKey: `ad:${impressionId}`,
        });

        // Referral stages progress only through verified ad views.
        if (user.data.referred_by) {
          const ref = await client
            .from("referrals")
            .select("id, referrer_id, stage, earned, ads_day1, ads_day2")
            .eq("referred_id", user.data.id as string)
            .maybeSingle();
          if (ref.data && ref.data.stage !== "fake" && ref.data.stage !== "verified") {
            const ageDays = Math.floor(
              (Date.now() - Date.parse(user.data.created_at as string)) / 86_400_000,
            );
            const day1 = Number(ref.data.ads_day1) + (ageDays < 1 ? 1 : 0);
            const day2 = Number(ref.data.ads_day2) + (ageDays >= 1 ? 1 : 0);

            let stage = ref.data.stage as string;
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
        }

        return new Response("ok");
      },
    },
  },
});
