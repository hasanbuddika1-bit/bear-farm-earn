import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Landmark } from "lucide-react";

import { api } from "@/lib/api";
import { formatDate, formatUsd } from "@/lib/format";
import { Card, EmptyState, GuideBox, SectionTitle, StatPill } from "@/components/ui-kit";

export const Route = createFileRoute("/profile/payouts")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Public Payouts — Bear Farm" },
      {
        name: "description",
        content: "Recent approved USDT payouts and total amount paid out by Bear Farm.",
      },
      { property: "og:title", content: "Public Payouts — Bear Farm" },
      {
        property: "og:description",
        content: "Transparency page with recent Bear Farm USDT BEP-20 payouts.",
      },
    ],
  }),
  component: PayoutsPage,
});

function PayoutsPage() {
  const query = useQuery({
    queryKey: ["public-payouts"],
    queryFn: () => api.publicPayouts({}),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Link to="/profile" className="farm-panel !p-2">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Landmark className="size-5 text-usdt" /> Public payouts
        </h1>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <StatPill label="Total paid" value={formatUsd(query.data?.totalPaidUsd ?? 0)} tone="usdt" />
        <StatPill label="Pending" value={formatUsd(query.data?.pendingUsd ?? 0)} tone="gold" />
      </div>

      <section className="mt-4 px-4">
        <SectionTitle title="Latest approved payouts" />
        {query.isLoading ? (
          <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
        ) : (query.data?.recent ?? []).length === 0 ? (
          <Card>
            <EmptyState emoji="💸" text="No payouts published yet." />
          </Card>
        ) : (
          <div className="space-y-2">
            {query.data!.recent.map((row, i) => (
              <Card key={i} className="flex items-center gap-3">
                <span className="text-xl">✅</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold">{row.name}</p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(row.paidAt)}</p>
                </div>
                <span className="font-display text-sm font-extrabold text-usdt">
                  {formatUsd(row.netUsd)}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Payouts guide 💵"
          points={[
            "Only approved payouts appear here, with shortened display names for privacy.",
            "Every approval is also posted to the payment channel by the bot.",
            "Wallet addresses and Telegram IDs are never published.",
          ]}
        />
      </div>
    </div>
  );
}
