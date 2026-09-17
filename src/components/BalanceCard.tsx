import { Coins, ShieldCheck } from "lucide-react";
import logo from "@/assets/bear-farm-logo.png.asset.json";
import { formatTokens, formatUsd, tokensToUsd } from "@/lib/format";
import type { AppConfig, UserDoc } from "@/lib/types";

export function UserHeader({ user }: { user: UserDoc }) {
  const name =
    user.username ? `@${user.username}` : [user.firstName, user.lastName].filter(Boolean).join(" ");
  return (
    <header className="flex items-center gap-3 px-4 pt-4">
      <div className="relative">
        {user.photoUrl ? (
          <img
            src={user.photoUrl}
            alt=""
            className="size-11 rounded-full border-2 border-primary object-cover"
          />
        ) : (
          <div className="flex size-11 items-center justify-center rounded-full border-2 border-primary bg-secondary text-lg">
            🐻
          </div>
        )}
        <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-card bg-success" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-extrabold">{name || "Farmer"}</p>
        <p className="text-[11px] text-muted-foreground">ID {user.telegramId}</p>
      </div>
      <span className="flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-bold text-success">
        <ShieldCheck className="size-3" /> Verified
      </span>
    </header>
  );
}

export function BalanceCard({ user, config }: { user: UserDoc; config: AppConfig }) {
  const usd = tokensToUsd(user.balance, config.tokensPerUsd);
  return (
    <div className="relative mx-4 mt-4 overflow-hidden farm-card p-5">
      <div className="pointer-events-none absolute -top-8 -right-8 size-32 rounded-full bg-primary/10 blur-2xl" />
      <img
        src={logo.url}
        alt=""
        className="pointer-events-none absolute -right-6 -bottom-8 size-32 opacity-20"
      />
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        <Coins className="size-3.5 text-primary" /> {config.tokenName} balance
      </p>
      <div className="mt-1 flex items-end gap-2">
        <span className="font-display text-4xl font-extrabold gold-text">
          {formatTokens(user.balance)}
        </span>
        <span className="pb-1 font-display text-sm font-bold text-primary">
          {config.tokenSymbol}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-usdt/20 px-3 py-1 text-xs font-bold text-usdt">
          ≈ {formatUsd(usd)} USDT
        </span>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          Total earned {formatTokens(user.totalEarned)}
        </span>
      </div>
    </div>
  );
}
