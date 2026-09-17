import { useEffect, useState } from "react";
import { CalendarCheck, Gift, Ticket } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { formatCountdown, formatTokens, msUntilUtcMidnight, utcDayKey } from "@/lib/format";
import { hapticNotify } from "@/lib/telegram";
import { PopButton } from "./ui-kit";
import type { AppConfig, UserDoc } from "@/lib/types";

export function DailyRewardCard({
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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + serverOffset), 1000);
    return () => clearInterval(id);
  }, [serverOffset]);

  const today = utcDayKey(now);
  const claimedToday = user.daily.lastClaimDay === today;
  const dayIndex = claimedToday ? user.daily.streak - 1 : user.daily.streak % config.dailyRewards.length;
  const nextReward = config.dailyRewards[Math.min(dayIndex, config.dailyRewards.length - 1)] ?? 0;

  async function claim() {
    setBusy(true);
    try {
      const res = await api.claimDaily({ idempotencyKey: newIdempotencyKey("daily") });
      hapticNotify("success");
      toast.success(`🎁 Day ${res.streak} reward: ${formatTokens(res.awarded)} ${config.tokenSymbol}`);
    } catch (error) {
      hapticNotify("error");
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 mt-4 farm-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
          <CalendarCheck className="size-5 text-accent" /> Daily reward
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Resets in {formatCountdown(msUntilUtcMidnight(now))} UTC
        </span>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5">
        {config.dailyRewards.map((amount, i) => {
          const done = claimedToday ? i < user.daily.streak : i < user.daily.streak;
          const isNext = !claimedToday && i === dayIndex;
          return (
            <div
              key={i}
              className={`rounded-lg border px-1 py-2 text-center ${
                done
                  ? "border-accent bg-accent/20"
                  : isNext
                    ? "border-primary bg-primary/15"
                    : "border-border bg-secondary/40"
              }`}
            >
              <p className="text-[9px] font-bold text-muted-foreground">D{i + 1}</p>
              <p className="font-display text-[11px] font-extrabold">{amount}</p>
              <p className="text-[10px]">{done ? "✅" : isNext ? "🎁" : "🔒"}</p>
            </div>
          );
        })}
      </div>

      <PopButton
        className="mt-3 w-full"
        variant={claimedToday ? "muted" : "accent"}
        disabled={claimedToday}
        loading={busy}
        onClick={claim}
      >
        <Gift className="size-4" />
        {claimedToday
          ? "Claimed today — come back after 00:00 UTC"
          : `Claim day ${dayIndex + 1} · ${formatTokens(nextReward)} ${config.tokenSymbol}`}
      </PopButton>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Miss a day and the streak restarts at day 1. Streak: {user.daily.streak} 🔥
      </p>
    </div>
  );
}

export function RewardCodeCard({ config }: { config: AppConfig }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function claim() {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await api.claimRewardCode({ code: code.trim().toUpperCase() });
      hapticNotify("success");
      toast.success(`🎟️ Code accepted: +${formatTokens(res.awarded)} ${config.tokenSymbol}`);
      setCode("");
    } catch (error) {
      hapticNotify("error");
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 mt-4 farm-card p-4">
      <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
        <Ticket className="size-5 text-primary" /> Reward code
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Reward codes are posted in our community channel. Grab one and redeem it here.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 24))}
          placeholder="BEAR-XXXX"
          className="min-w-0 flex-1 rounded-xl border border-input bg-input/50 px-3 py-3 font-display text-sm font-bold tracking-wider uppercase outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <PopButton onClick={claim} loading={busy} disabled={!code.trim()}>
          Redeem
        </PopButton>
      </div>
    </div>
  );
}
