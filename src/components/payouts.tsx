import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { openExternal } from "@/lib/telegram";
import { formatUsd } from "@/lib/format";
import { EmptyState } from "@/components/ui-kit";

/** Tether (USDT) mark drawn inline so it always loads. */
export function UsdtLogo({ className = "size-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-label="USDT" role="img">
      <circle cx="16" cy="16" r="16" fill="var(--usdt)" />
      <path
        fill="var(--background)"
        d="M17.9 17.2v0c-.1 0-.7.1-1.9.1-1 0-1.6 0-1.9-.1v0c-3.6-.2-6.3-.8-6.3-1.6s2.7-1.4 6.3-1.6v2.5c.3 0 .9.1 1.9.1 1.2 0 1.7-.1 1.9-.1v-2.5c3.6.2 6.3.8 6.3 1.6s-2.7 1.4-6.3 1.6zm0-3.4V11.6h5V8.3H9.1v3.3h5v2.2c-4.1.2-7.1 1-7.1 2s3 1.8 7.1 2v7h3.8v-7c4-.2 7-1 7-2s-3-1.8-7-2z"
      />
    </svg>
  );
}

export function utcTime(ms: number) {
  if (!Number.isFinite(ms)) return "—";
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

export function maskName(name: string) {
  const n = name.trim() || "Farmer";
  return n.length <= 3 ? `${n[0]}**` : `${n.slice(0, 3)}${"*".repeat(Math.min(4, n.length - 3))}`;
}

export function HistoryRow({
  icon,
  title,
  subtitle,
  right,
  rightSub,
  badge,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
  right: ReactNode;
  rightSub?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="farm-card flex items-center gap-3 p-3 animate-in fade-in slide-in-from-bottom-1">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{title}</p>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display text-sm font-extrabold">{right}</p>
        {rightSub ? <div className="mt-0.5">{rightSub}</div> : null}
        {badge}
      </div>
    </div>
  );
}

export function PayoutProofs({ limit = 20 }: { limit?: number }) {
  const { config } = useAuth();
  const q = useQuery({
    queryKey: ["payout-stats"],
    queryFn: () => api.publicPayouts({}),
    staleTime: 5 * 60_000,
  });
  const rows = (q.data?.recent ?? []).slice(0, limit);

  return (
    <section className="farm-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ShieldCheck className="size-5 text-usdt" />
        <h2 className="font-display text-base font-extrabold">Proof of Payouts</h2>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-usdt/15 px-2 py-0.5 text-[10px] font-bold uppercase text-usdt">
          <span className="size-1.5 animate-pulse rounded-full bg-usdt" /> Live
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-xl bg-usdt/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total paid out</p>
          <p className="mt-1 flex items-center gap-1.5 font-display text-lg font-extrabold text-usdt">
            <UsdtLogo className="size-5" /> {formatUsd(q.data?.totalPaidUsd ?? 0)}
          </p>
        </div>
        <div className="rounded-xl bg-primary/10 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Payouts</p>
          <p className="mt-1 font-display text-lg font-extrabold gold-text">{q.data?.payoutCount ?? 0}</p>
        </div>
      </div>

      <div className="max-h-96 space-y-2 overflow-y-auto px-3 pb-3">
        {q.isLoading ? (
          <p className="animate-pulse py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState emoji="💸" text="No payouts published yet." />
        ) : (
          rows.map((row, i) => (
            <div key={i} className="rounded-xl bg-secondary/40 px-3 py-2">
              <div className="flex items-center gap-3">
                <UsdtLogo className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold">{maskName(row.name)}</p>
                  <p className="text-[10px] text-muted-foreground">{utcTime(row.paidAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-sm font-extrabold text-usdt">{formatUsd(row.netUsd)}</p>
                  <p className="text-[9px] font-bold uppercase text-success">✓ Paid · BEP-20</p>
                </div>
              </div>
              {row.txId ? (
                <button
                  type="button"
                  onClick={() => openExternal(`https://bscscan.com/tx/${row.txId}`)}
                  className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg bg-background/40 px-2 py-1 text-left font-mono text-[10px] text-muted-foreground"
                >
                  <span className="truncate">
                    Tx {row.txId.slice(0, 10)}…{row.txId.slice(-8)} · to {row.wallet}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-sans font-bold text-usdt">
                    BscScan <ExternalLink className="size-3" />
                  </span>
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {config?.paymentChannelUrl ? (
        <button
          type="button"
          onClick={() => openExternal(config.paymentChannelUrl)}
          className="flex w-full items-center justify-center gap-2 border-t border-border bg-usdt/10 px-4 py-3 font-display text-sm font-bold text-usdt"
        >
          View Payout Proofs Channel <ExternalLink className="size-4" />
        </button>
      ) : null}
    </section>
  );
}
