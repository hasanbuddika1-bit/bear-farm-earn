import { useEffect, useState } from "react";
import { Pickaxe, Timer, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatCountdown, formatTokens } from "@/lib/format";
import { hapticNotify } from "@/lib/telegram";
import { PopButton } from "./ui-kit";
import type { AppConfig, UserDoc } from "@/lib/types";

export function MiningCard({
  user,
  config,
  serverOffset,
}: {
  user: UserDoc;
  config: AppConfig;
  serverOffset: number;
}) {
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + serverOffset), 1000);
    return () => clearInterval(id);
  }, [serverOffset]);

  const endsAt = user.mining.endsAt ?? 0;
  const startedAt = user.mining.startedAt ?? 0;
  const running = user.mining.active && endsAt > now;
  const finished = user.mining.active && endsAt > 0 && endsAt <= now;
  const cycleMs = Math.max(1, config.miningCycleMinutes) * 60_000;
  const progress = running
    ? Math.min(100, Math.max(0, ((now - startedAt) / (endsAt - startedAt || cycleMs)) * 100))
    : finished
      ? 100
      : 0;
  const mined = Math.floor((progress / 100) * config.miningRewardPerCycle);

  async function start() {
    setBusy(true);
    try {
      await api.startMining();
      hapticNotify("success");
      toast.success("⛏️ Mining started! Come back in an hour.");
    } catch (error) {
      hapticNotify("error");
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    setBusy(true);
    try {
      const res = await api.claimMining({ idempotencyKey: newIdempotencyKey("mine") });
      setPop((n) => n + 1);
      hapticNotify("success");
      toast.success(`🌾 Claimed ${formatTokens(res.awarded)} ${config.tokenSymbol}!`);
    } catch (error) {
      hapticNotify("error");
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative mx-4 mt-4 overflow-hidden farm-card p-5">
      {pop > 0 ? (
        <span
          key={pop}
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 font-display text-2xl font-extrabold text-primary animate-coin-rise"
        >
          +{formatTokens(config.miningRewardPerCycle)} 🪙
        </span>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
          <Pickaxe className={`size-5 text-primary ${running ? "animate-float" : ""}`} /> Mining farm
        </h2>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
            running
              ? "bg-accent/20 text-accent"
              : finished
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {running ? "MINING" : finished ? "READY TO CLAIM" : "IDLE"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div className="relative flex size-24 shrink-0 items-center justify-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-muted)" strokeWidth="9" />
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 276.5} 276.5`}
            />
          </svg>
          <span className="font-display text-lg font-extrabold text-primary">
            {Math.floor(progress)}%
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="size-3.5" />
            {running
              ? `Ends in ${formatCountdown(endsAt - now)}`
              : finished
                ? "Cycle complete — claim your harvest"
                : `${config.miningCycleMinutes} min per cycle`}
          </p>
          <p className="mt-1 font-display text-2xl font-extrabold">
            {formatTokens(running ? mined : finished ? config.miningRewardPerCycle : 0)}
            <span className="ml-1 text-xs font-bold text-muted-foreground">
              / {formatTokens(config.miningRewardPerCycle)} {config.tokenSymbol}
            </span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {finished ? (
        <PopButton variant="primary" className="mt-4 w-full" onClick={claim} loading={busy}>
          <Sparkles className="size-4" /> Claim {formatTokens(config.miningRewardPerCycle)}{" "}
          {config.tokenSymbol}
        </PopButton>
      ) : (
        <PopButton
          variant={running ? "muted" : "accent"}
          className="mt-4 w-full"
          onClick={start}
          loading={busy}
          disabled={running}
        >
          <Pickaxe className="size-4" /> {running ? "Mining in progress…" : "Start mining"}
        </PopButton>
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Mining stops automatically after each cycle. Claim first, then start again.
      </p>
    </div>
  );
}
