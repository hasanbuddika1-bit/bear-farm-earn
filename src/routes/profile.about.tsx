import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Info } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { formatTokens } from "@/lib/format";
import { Card, SectionTitle } from "@/components/ui-kit";

export const Route = createFileRoute("/profile/about")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "About — Bear Farm" },
      {
        name: "description",
        content: "How Bear Farm works: mining, tasks, ads, referrals, withdrawals and the fair-play rules.",
      },
      { property: "og:title", content: "About — Bear Farm" },
      {
        property: "og:description",
        content: "Everything about earning and withdrawing on Bear Farm.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const { config } = useAuth();

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Link to="/profile" className="farm-panel !p-2">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Info className="size-5 text-accent" /> About Bear Farm
        </h1>
      </div>

      <div className="mt-3 space-y-3 px-4">
        <Card>
          <SectionTitle title="What is Bear Farm? 🐻🌾" />
          <p className="text-sm text-muted-foreground">
            Bear Farm is a Telegram mini app where you farm {config?.tokenName ?? "Bear Farm Token"} (
            {config?.tokenSymbol ?? "BFT"}) by mining, completing tasks, watching ads and inviting
            friends. Tokens can be withdrawn as USDT on the BEP-20 network.
          </p>
        </Card>

        <Card>
          <SectionTitle title="Mining ⛏️" />
          <p className="text-sm text-muted-foreground">
            Each mining cycle runs for {config?.miningCycleMinutes ?? 60} minutes and pays{" "}
            {formatTokens(config?.miningRewardPerCycle ?? 100)} {config?.tokenSymbol}. Mining stops
            when the cycle ends; you must claim before starting a new cycle. The bot messages you the
            moment a cycle completes.
          </p>
        </Card>

        <Card>
          <SectionTitle title="Daily rewards 🎁" />
          <p className="text-sm text-muted-foreground">
            Day 1 to day 7 pays 30, 40, 50, 70, 90, 120 and 150 tokens. Everything resets at
            00:00:00 UTC, and missing one day sends you back to day 1.
          </p>
        </Card>

        <Card>
          <SectionTitle title="Tasks & ads 📋📺" />
          <p className="text-sm text-muted-foreground">
            Telegram channel tasks are verified through the bot, so you must actually be a member.
            Link and mini app tasks unlock a claim button 5 seconds after opening. Ad rewards are
            only paid after the ad provider confirms a completed view on the server.
          </p>
        </Card>

        <Card>
          <SectionTitle title="Referrals 🤝" />
          <p className="text-sm text-muted-foreground">
            You earn {formatTokens(config?.referralJoinReward ?? 200)} when a friend joins,{" "}
            {formatTokens(config?.referralStage1Reward ?? 400)} after their first-day ads and{" "}
            {formatTokens(config?.referralStage2Reward ?? 600)} after their second-day ads — up to{" "}
            {formatTokens(
              (config?.referralJoinReward ?? 200) +
                (config?.referralStage1Reward ?? 400) +
                (config?.referralStage2Reward ?? 600),
            )}{" "}
            per verified friend. Referral rewards sit in a separate pot until you claim them.
          </p>
        </Card>

        <Card>
          <SectionTitle title="Withdrawals 💸" />
          <p className="text-sm text-muted-foreground">
            {formatTokens(config?.tokensPerUsd ?? 100000)} {config?.tokenSymbol} = $1. The first
            withdrawal needs {formatTokens(config?.firstWithdrawMinTokens ?? 10000)} tokens, later
            ones {formatTokens(config?.nextWithdrawMinTokens ?? 20000)}. The fee is $
            {config?.withdrawFeeFlatUsd ?? 0.01} plus {config?.withdrawFeePercent ?? 5}%. Approved
            payouts are posted publicly in the payment channel.
          </p>
        </Card>

        <Card>
          <SectionTitle title="Fair play 🛡️" />
          <p className="text-sm text-muted-foreground">
            All balances, rewards and withdrawals are calculated on the server. Multiple accounts per
            device or IP, self-referrals, bots, emulators and VPN abuse cause automatic suspension.
            If your balance ever disagrees with the ledger the account is frozen and reviewed by an
            admin.
          </p>
        </Card>

        <Card>
          <SectionTitle title="Need help? 💬" />
          <p className="text-sm text-muted-foreground">
            Ask in the community channel — that is also where reward codes are published. Support
            never asks for your wallet seed phrase or private keys.
          </p>
        </Card>
      </div>
    </div>
  );
}
