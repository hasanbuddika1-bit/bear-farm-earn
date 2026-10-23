import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayCircle, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Card, EmptyState, PopButton } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { showAdsgram } from "@/lib/adsgram";
import type { AdNetworkDoc } from "@/lib/types";

export const Route = createFileRoute("/ads")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Watch & Earn — Bear Farm" },
      { name: "description", content: "Watch short ads to earn Bear Farm tokens every day." },
      { property: "og:title", content: "Watch & Earn — Bear Farm" },
      { property: "og:description", content: "Watch ads, earn BFT tokens on Bear Farm." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WatchPage,
});

const CARD_TONES = [
  "from-[oklch(0.72_0.19_45)] to-[oklch(0.6_0.2_20)]",
  "from-[oklch(0.7_0.17_150)] to-[oklch(0.55_0.15_190)]",
  "from-[oklch(0.68_0.2_300)] to-[oklch(0.55_0.2_265)]",
  "from-[oklch(0.8_0.16_85)] to-[oklch(0.65_0.18_55)]",
];

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

function WatchPage() {
  const q = useQuery({ queryKey: ["ads"], queryFn: () => api.listAdNetworks(), staleTime: 10_000 });
  const networks = q.data?.networks ?? [];
  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <PlayCircle className="size-6 text-accent" /> Watch & Earn
        </h1>
        <p className="text-xs text-muted-foreground">
          5 ads per card every day · watched today: {q.data?.watchedToday ?? 0}
        </p>
      </div>
      <div className="mt-4 space-y-3 px-4">
        {q.isLoading ? <Card className="animate-pulse text-center text-sm">Loading…</Card> : null}
        {!q.isLoading && (!q.data?.adsEnabled || networks.length === 0) ? (
          <Card>
            <EmptyState emoji="🎬" text="No ads right now. Come back soon, farmer! 🐻🌾" />
          </Card>
        ) : null}
        {q.data?.adsEnabled
          ? networks.map((n, i) => <AdCard key={n.id} n={n} tone={CARD_TONES[i % CARD_TONES.length]!} />)
          : null}
      </div>
    </div>
  );
}

function AdCard({ n, tone }: { n: AdNetworkDoc; tone: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(n.cooldownLeft);
  useEffect(() => setCooldown(n.cooldownLeft), [n.cooldownLeft]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const done = n.remainingToday <= 0;

  async function watch() {
    setBusy(true);
    try {
      const s = await api.startAdSession({ networkId: n.id });
      const startedAt = Date.now();
      const played = await showAdsgram(s.blockId);
      if (!played) {
        toast.error("Ad did not play. Please try again.");
        return;
      }
      const left = s.waitSeconds * 1000 - (Date.now() - startedAt);
      if (left > 0) await new Promise((r) => setTimeout(r, left + 300));
      const res = await api.claimAdSession({ sessionId: s.sessionId });
      toast.success(`🎉 +${res.awarded} BFT`);
      setCooldown(10);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["ads"] });
    }
  }

  return (
    <div className={`overflow-hidden rounded-3xl bg-gradient-to-br ${tone} p-[2px] shadow-lg`}>
      <div className="rounded-[22px] bg-card/85 p-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className={`flex size-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${tone}`}>
            {n.logoUrl ? <img src={n.logoUrl} alt="" className="size-full object-cover" /> : <span className="text-2xl">📺</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base font-extrabold">{n.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {n.watchedToday}/{n.dailyLimit} today
            </p>
          </div>
          <div className="text-right">
            <p className="flex items-center gap-1 font-display text-lg font-extrabold text-primary">
              <Sparkles className="size-4" />
              {done ? "✓" : `+${n.reward}`}
            </p>
            <p className="text-[10px] text-muted-foreground">BFT</p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {n.rewardSteps.map((r, i) => (
            <div
              key={i}
              className={`flex-1 rounded-lg py-1 text-center text-[10px] font-bold ${
                i < n.watchedToday ? `bg-gradient-to-br ${tone} text-primary-foreground` : "bg-muted text-muted-foreground"
              }`}
            >
              {r}
            </div>
          ))}
        </div>
        <PopButton className="mt-3 w-full" loading={busy} disabled={done || cooldown > 0 || busy} onClick={watch}>
          {done ? "Done for today ✅" : cooldown > 0 ? `Next ad in ${cooldown}s` : "▶ Watch ad"}
        </PopButton>
      </div>
    </div>
  );
}
