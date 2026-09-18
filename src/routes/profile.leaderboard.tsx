import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTokens } from "@/lib/format";
import { Card, EmptyState, GuideBox, SectionTitle } from "@/components/ui-kit";

export const Route = createFileRoute("/profile/leaderboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Leaderboard — Bear Farm" },
      {
        name: "description",
        content: "Top Bear Farm earners of the week, ranked by verified token earnings.",
      },
      { property: "og:title", content: "Leaderboard — Bear Farm" },
      {
        property: "og:description",
        content: "See the top farmers and where you stand this week.",
      },
    ],
  }),
  component: LeaderboardPage,
});

const MEDALS = ["🥇", "🥈", "🥉"];

function LeaderboardPage() {
  const { config } = useAuth();
  const query = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => api.publicLeaderboard({}),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Link to="/profile" className="farm-panel !p-2">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Trophy className="size-5 text-primary" /> Leaderboard
        </h1>
      </div>

      <section className="mt-3 px-4">
        <SectionTitle title="Top farmers" />
        {query.isLoading ? (
          <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
        ) : (query.data?.rows ?? []).length === 0 ? (
          <Card>
            <EmptyState emoji="🏆" text="Leaderboard is still being harvested." />
          </Card>
        ) : (
          <div className="space-y-2">
            {query.data!.rows.map((row, i) => (
              <Card
                key={`${row.name}-${i}`}
                className={`flex items-center gap-3 ${row.isMe ? "!border-primary" : ""}`}
              >
                <span className="w-7 text-center text-lg font-extrabold">
                  {MEDALS[i] ?? i + 1}
                </span>
                <p className="min-w-0 flex-1 truncate font-display text-sm font-bold">
                  {row.name} {row.isMe ? "· you" : ""}
                </p>
                <span className="font-display text-sm font-extrabold gold-text">
                  {formatTokens(row.earned)} {config?.tokenSymbol}
                </span>
              </Card>
            ))}
          </div>
        )}
        {query.data?.myRank ? (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Your rank: #{query.data.myRank}
          </p>
        ) : null}
      </section>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Leaderboard guide 🏆"
          points={[
            "Ranking uses verified earnings only — fake or suspended accounts are excluded.",
            "Only public display names are shown; Telegram IDs and wallets stay private.",
            "The board is recomputed periodically, so it may lag a few minutes behind.",
          ]}
        />
      </div>
    </div>
  );
}
