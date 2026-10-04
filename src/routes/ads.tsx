import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayCircle, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTokens } from "@/lib/format";
import { hapticNotify, openExternal } from "@/lib/telegram";
import { Card, EmptyState, GuideBox, PopButton, SectionTitle } from "@/components/ui-kit";
import type { AdNetworkDoc } from "@/lib/types";

// Hidden until the Adsgram account is approved; remove beforeLoad to bring the tab back.
export const Route = createFileRoute("/ads")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Watch Ads — Bear Farm" },
      { name: "description", content: "Watch rewarded ads from Adsgram, Monetag and GigaPub to farm extra Bear Farm tokens." },
      { property: "og:title", content: "Watch Ads — Bear Farm" },
      { property: "og:description", content: "Rewarded ads with server-verified rewards." },
    ],
  }),
  component: AdsPage,
});

const SDK: Record<string, string> = {
  adsgram: "https://sad.adsgram.ai/js/sad.min.js",
  monetag: "https://libtl.com/sdk.js",
};

function loadScript(src: string, attrs: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const key = src + JSON.stringify(attrs);
    if (document.querySelector(`script[data-bf="${CSS.escape(key)}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset["bf"] = key;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Ad provider failed to load."));
    document.head.appendChild(s);
  });
}

async function showProviderAd(provider: string, blockId: string, url: string) {
  const w = window as unknown as Record<string, unknown>;
  if (provider === "adsgram" && blockId) {
    await loadScript(SDK["adsgram"]!);
    const Adsgram = w["Adsgram"] as { init: (o: { blockId: string }) => { show: () => Promise<unknown> } } | undefined;
    if (!Adsgram) throw new Error("Adsgram is not available.");
    await Adsgram.init({ blockId }).show();
    return;
  }
  if (provider === "monetag" && blockId) {
    const fn = `show_${blockId}`;
    await loadScript(SDK["monetag"]!, { "data-zone": blockId, "data-sdk": fn });
    const show = w[fn] as (() => Promise<unknown>) | undefined;
    if (!show) throw new Error("Monetag is not available.");
    await show();
    return;
  }
  if (url) {
    openExternal(url);
    return;
  }
  throw new Error("This ad network is not configured yet.");
}

function AdsPage() {
  const { user, config } = useAuth();
  const list = useQuery({ queryKey: ["adNetworks"], queryFn: () => api.listAdNetworks(), staleTime: 15_000 });
  if (!user || !config) return null;
  const networks = list.data?.networks ?? [];

  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <PlayCircle className="size-6 text-primary" /> Watch & Earn
        </h1>
        <p className="text-xs text-muted-foreground">
          Today: {list.data?.watchedToday ?? 0} ads 📺 · Total {formatTokens(user.adsWatchedTotal)}
        </p>
      </div>

      <section className="mt-4 px-4">
        <SectionTitle icon={<ShieldCheck className="size-4 text-success" />} title="Ad networks" />
        {list.isLoading ? (
          <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
        ) : list.data && !list.data.adsEnabled ? (
          <Card><EmptyState emoji="⏸️" text="Ads are paused right now." /></Card>
        ) : networks.length === 0 ? (
          <Card><EmptyState emoji="📺" text="No ads available right now. Check back soon!" /></Card>
        ) : (
          <div className="space-y-2">
            {networks.map((n) => (
              <AdCard key={n.id} net={n} symbol={config.tokenSymbol} />
            ))}
          </div>
        )}
      </section>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Ads guide 📺"
          points={[
            "Watch the full ad, then press Claim when the timer ends. The server checks the time.",
            "Each network has its own daily limit and short cooldown.",
            `Your invited friends become verified after ${config.referralStage1Ads} ads on day 1 and ${config.referralStage2Ads} ads on day 2.`,
            "VPN, emulators or multiple accounts per device lead to suspension.",
          ]}
        />
      </div>
    </div>
  );
}

function AdCard({ net, symbol }: { net: AdNetworkDoc; symbol: string }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [cool, setCool] = useState(net.cooldownLeft);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);

  useEffect(() => setCool(net.cooldownLeft), [net.cooldownLeft]);
  useEffect(() => {
    if (wait <= 0 && cool <= 0) return;
    const id = setInterval(() => {
      setWait((w) => Math.max(0, w - 1));
      setCool((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [wait, cool]);

  const done = net.remainingToday <= 0;

  async function watch() {
    setBusy(true);
    try {
      const res = await api.startAdSession({ networkId: net.id });
      setSession(res.sessionId);
      setWait(res.waitSeconds);
      await showProviderAd(res.provider, res.blockId, res.url);
    } catch (error) {
      hapticNotify("error");
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    if (!session) return;
    setBusy(true);
    try {
      const res = await api.claimAdSession({ sessionId: session });
      hapticNotify("success");
      toast.success(`📺 +${formatTokens(res.awarded)} ${symbol}`);
      setSession(null);
      void qc.invalidateQueries({ queryKey: ["adNetworks"] });
    } catch (error) {
      hapticNotify("error");
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex items-center gap-3">
      {net.logoUrl && !broken ? (
        <img
          src={net.logoUrl}
          alt={net.name}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-12 shrink-0 rounded-xl bg-secondary object-contain p-1"
        />
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 font-display text-lg font-extrabold text-primary">
          {net.name.slice(0, 1)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{net.name}</p>
        <p className="text-xs text-primary">+{formatTokens(net.reward)} {symbol} / ad</p>
        <p className="text-[11px] text-muted-foreground">
          {net.watchedToday}/{net.dailyLimit} today
        </p>
      </div>
      {session ? (
        <PopButton variant="accent" className="!px-3 !py-2" onClick={claim} loading={busy} disabled={wait > 0}>
          {wait > 0 ? `${wait}s` : "Claim"}
        </PopButton>
      ) : (
        <PopButton className="!px-3 !py-2" onClick={watch} loading={busy} disabled={done || cool > 0}>
          {done ? "Done" : cool > 0 ? `${cool}s` : "Watch"}
        </PopButton>
      )}
    </Card>
  );
}
