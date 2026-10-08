import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Landmark } from "lucide-react";

import { GuideBox } from "@/components/ui-kit";
import { PayoutProofs } from "@/components/payouts";

export const Route = createFileRoute("/profile/payouts")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Public Payouts — Bear Farm" },
      {
        name: "description",
        content: "Every approved Bear Farm USDT BEP-20 payout with its on-chain transaction hash.",
      },
      { property: "og:title", content: "Public Payouts — Bear Farm" },
      {
        property: "og:description",
        content: "Verifiable Bear Farm USDT payouts — check each transaction on BscScan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayoutsPage,
});

function PayoutsPage() {
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

      <div className="mx-4 mt-3">
        <PayoutProofs limit={50} />
      </div>

      <div className="mx-4 mt-4">
        <GuideBox
          title="How to verify a payout 🔍"
          points={[
            "Every approved withdrawal is listed here with its real USDT BEP-20 transaction hash.",
            "Tap BscScan on any payout to see the transfer on the blockchain: amount, time and receiving wallet.",
            "Each payout is also posted by the bot in the public payment channel.",
            "Names and wallets are shortened for privacy; Telegram IDs are never published.",
          ]}
        />
      </div>
    </div>
  );
}
