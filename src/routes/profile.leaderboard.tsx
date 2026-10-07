import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTokens } from "@/lib/format";
import { Card, EmptyState, GuideBox } from "@/components/ui-kit";

export const Route = createFileRoute("/profile/leaderboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Leaderboard — Bear Farm" },
      {
        name: "description",
        content: "Top Bear Farm earners and top inviters, ranked live.",
      },
      { property: "og:title", content: "Leaderboard — Bear Farm" },
      {
        property: "og:description",
        content: "See the top farmers, the best inviters and where you stand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeaderboardPage,
});

type Tab = "earn" | "refer";

interface BoardRow {
  name: string;
  value: string;
  sub?: string;
  isMe: boolean;
}

function LeaderboardPage() {
  const { config } = useAuth();
  const [tab, setTab] = useState<Tab>("earn");

  const earn = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => api.publicLeaderboard({}),
    staleTime: 60_000,
  });
  const refer = useQuery({
    queryKey: ["referral-leaderboard"],
    queryFn: () => api.referralLeaderboard(),
    staleTime: 60_000,
    enabled: tab === "refer",
  });

  const active = tab === "earn" ? earn : refer;
  const rows: BoardRow[] =
    tab === "earn"
      ? (earn.data?.rows ?? []).map((r) => ({
          name: r.name,
          value: `${formatTokens(r.earned)}`,
          sub: config?.tokenSymbol ?? "tokens",
          isMe: r.isMe,
        }))
      : (refer.data?.rows ?? []).map((r) => ({
          name: r.name,
          value: `${r.active}`,
          sub: `active · ${r.total} invited`,
          isMe: r.isMe,
        }));
  const myRank = active.data?.myRank ?? null;

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Link to="/profile" className="farm-panel !p-2" aria-label="Back">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Trophy className="size-5 text-primary" /> Leaderboard
        </h1>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-2 gap-1 rounded-2xl border border-border bg-card/70 p-1 backdrop-blur">
        {(
          [
            ["earn", "🍯 Top Earners"],
            ["refer", "🤝 Top Inviters"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-xl py-2.5 font-display text-sm font-extrabold transition ${
              tab === key
                ? "bg-[image:var(--gradient-gold)] text-primary-foreground shadow-md"
                : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="mt-4 px-4">
        {active.isLoading ? (
          <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState
              emoji={tab === "earn" ? "🏆" : "🤝"}
              text={tab === "earn" ? "Leaderboard is still being harvested." : "No inviters yet — be the first!"}
            />
          </Card>
        ) : (
          <>
            <Podium rows={rows.slice(0, 3)} />
            <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur">
              {rows.slice(3).map((row, i) => (
                <div
                  key={`${row.name}-${i}`}
                  className={`flex items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-b-0 ${
                    row.isMe ? "bg-primary/15" : ""
                  }`}
                >
                  <span className="w-7 text-center font-display text-sm font-extrabold text-muted-foreground">
                    {i + 4}
                  </span>
                  <Avatar name={row.name} />
                  <p className="min-w-0 flex-1 truncate font-display text-sm font-bold">
                    {row.name} {row.isMe ? <span className="text-primary">· you</span> : null}
                  </p>
                  <div className="text-right">
                    <p className="font-display text-sm font-extrabold gold-text">{row.value}</p>
                    <p className="text-[10px] text-muted-foreground">{row.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-3 flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-sm font-bold">Your rank</span>
          <span className="font-display text-lg font-extrabold gold-text">
            {myRank ? `#${myRank}` : "—"}
          </span>
        </div>
      </section>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Leaderboard guide 🏆"
          points={[
            "Top Earners ranks farmers by balance; Top Inviters ranks by active friends.",
            "Fake or suspended accounts are never counted.",
            "Only display names are shown — Telegram IDs and wallets stay private.",
          ]}
        />
      </div>
    </div>
  );
}

function Avatar({ name, big = false }: { name: string; big?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-[image:var(--gradient-gold)] font-display font-extrabold text-primary-foreground ${
        big ? "size-14 text-xl" : "size-8 text-sm"
      }`}
    >
      {(name.trim()[0] ?? "F").toUpperCase()}
    </span>
  );
}

function Podium({ rows }: { rows: BoardRow[] }) {
  // Visual order: 2nd, 1st, 3rd
  const order = [rows[1], rows[0], rows[2]];
  const medals = ["🥈", "🥇", "🥉"];
  const heights = ["h-20", "h-28", "h-16"];
  return (
    <div className="farm-hero grid grid-cols-3 items-end gap-2 rounded-3xl px-3 pb-3 pt-5">
      {order.map((row, i) =>
        row ? (
          <div key={`${row.name}-${i}`} className="flex min-w-0 flex-col items-center">
            <span className={`text-2xl ${i === 1 ? "animate-bob" : ""}`}>{medals[i]}</span>
            <Avatar name={row.name} big={i === 1} />
            <p className="mt-1 w-full truncate text-center font-display text-xs font-bold">
              {row.name}
              {row.isMe ? " · you" : ""}
            </p>
            <p className="font-display text-sm font-extrabold gold-text">{row.value}</p>
            <div
              className={`mt-1 w-full rounded-t-xl border border-primary/30 bg-primary/15 ${heights[i]}`}
            />
          </div>
        ) : (
          <div key={`empty-${i}`} />
        ),
      )}
    </div>
  );
}
