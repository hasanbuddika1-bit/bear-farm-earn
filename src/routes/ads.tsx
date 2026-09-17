import { createFileRoute } from "@tanstack/react-router";
import { Globe, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { formatTokens } from "@/lib/format";
import { Card, EmptyState, GuideBox, SectionTitle } from "@/components/ui-kit";

export const Route = createFileRoute("/ads")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Watch Ads — Bear Farm" },
      {
        name: "description",
        content: "Watch rewarded ads and visit partner sites to farm extra Bear Farm tokens.",
      },
      { property: "og:title", content: "Watch Ads — Bear Farm" },
      {
        property: "og:description",
        content: "Rewarded ads and site visits with server-verified rewards.",
      },
    ],
  }),
  component: AdsPage,
});

function AdsPage() {
  const { user, config } = useAuth();
  const [tab, setTab] = useState<"ads" | "sites">("ads");
  if (!user || !config) return null;

  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <PlayCircle className="size-6 text-primary" /> Watch & Earn
        </h1>
        <p className="text-xs text-muted-foreground">
          Ads watched so far: {formatTokens(user.adsWatchedTotal)} 📺
        </p>
      </div>

      <div className="mx-4 mt-4 grid grid-cols-2 gap-2 farm-panel p-1.5">
        {(
          [
            { key: "ads", label: "Watch Ads", icon: PlayCircle },
            { key: "sites", label: "Visit Sites", icon: Globe },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 font-display text-sm font-extrabold transition-colors ${
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div className="mx-4 mt-4">
        <Card className="text-center">
          <div className="relative mx-auto flex size-20 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-ring" />
            <span className="relative text-4xl animate-float">{tab === "ads" ? "📺" : "🌐"}</span>
          </div>
          <h2 className="mt-3 font-display text-lg font-extrabold">
            {tab === "ads" ? "Rewarded ads coming soon" : "Site visits coming soon"}
          </h2>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
            This section activates as soon as the ad provider is connected. Rewards will only be
            paid after the provider confirms a completed view server-to-server — there is no
            button-only reward.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-xs font-semibold text-success">
            <ShieldCheck className="size-4" /> Server-verified rewards only
          </div>
        </Card>
      </div>

      <section className="mt-5 px-4">
        <SectionTitle
          icon={<Sparkles className="size-4 text-accent" />}
          title="Why this matters for referrals"
        />
        <Card>
          <EmptyState
            emoji="🎯"
            text={`Your invited friends become verified after ${config.referralStage1Ads} ads on day 1 and ${config.referralStage2Ads} ads on day 2 — these are counted here.`}
          />
        </Card>
      </section>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Ads guide 📺"
          points={[
            "Each ad view starts a server session; the reward is written only after the provider confirms the view.",
            "Rate limits apply per hour and per day. Suspicious or repeated sessions are rejected.",
            "Ads watched here also unlock your referrer's staged rewards.",
            "Using VPN, emulators or multiple accounts per device leads to suspension.",
          ]}
        />
      </div>
    </div>
  );
}
