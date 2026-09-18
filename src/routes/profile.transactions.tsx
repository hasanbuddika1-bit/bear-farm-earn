import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeft, ReceiptText } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate, formatTokens } from "@/lib/format";
import { Card, EmptyState, GuideBox, PopButton, SectionTitle } from "@/components/ui-kit";

export const Route = createFileRoute("/profile/transactions")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Transactions — Bear Farm" },
      {
        name: "description",
        content: "Full reward ledger of your Bear Farm account: mining, tasks, referrals and withdrawals.",
      },
      { property: "og:title", content: "Transactions — Bear Farm" },
      {
        property: "og:description",
        content: "Every token movement on your Bear Farm account, recorded server-side.",
      },
    ],
  }),
  component: TransactionsPage,
});

const ICONS: Record<string, string> = {
  mining: "⛏️",
  daily_reward: "🎁",
  reward_code: "🎟️",
  task: "📋",
  daily_task: "✅",
  referral: "🤝",
  ads: "📺",
  withdrawal: "📤",
  withdrawal_refund: "↩️",
  admin_adjustment: "🛠️",
};

function TransactionsPage() {
  const { config } = useAuth();
  const query = useInfiniteQuery({
    queryKey: ["ledger"],
    queryFn: ({ pageParam }) =>
      api.listLedger(pageParam ? { cursor: pageParam } : {}),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Link to="/profile" className="farm-panel !p-2">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <ReceiptText className="size-5 text-primary" /> Transactions
        </h1>
      </div>

      <section className="mt-3 px-4">
        <SectionTitle title="All activity" />
        {query.isLoading ? (
          <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
        ) : rows.length === 0 ? (
          <Card>
            <EmptyState emoji="🧾" text="No transactions yet. Start mining to see them here!" />
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <Card key={row.id} className="flex items-center gap-3">
                <span className="text-xl">{ICONS[row.type] ?? "🪙"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold">{row.label}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(row.createdAt)}</p>
                </div>
                <span
                  className={`font-display text-sm font-extrabold ${
                    row.amount >= 0 ? "text-success" : "text-destructive"
                  }`}
                >
                  {row.amount >= 0 ? "+" : "−"}
                  {formatTokens(Math.abs(row.amount))} {config?.tokenSymbol}
                </span>
              </Card>
            ))}
          </div>
        )}
        {query.hasNextPage ? (
          <PopButton
            variant="muted"
            className="mt-3 w-full"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </PopButton>
        ) : null}
      </section>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Transactions guide 🧾"
          points={[
            "Every reward and deduction is written to an append-only server ledger.",
            "If a balance does not match the ledger, the account is suspended automatically and an admin is notified.",
            "Pages load 20 records at a time to keep the app fast.",
          ]}
        />
      </div>
    </div>
  );
}
