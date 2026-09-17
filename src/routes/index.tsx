import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks, Users, Wallet, Megaphone, Banknote } from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { openExternal } from "@/lib/telegram";
import { UserHeader, BalanceCard } from "@/components/BalanceCard";
import { MiningCard } from "@/components/MiningCard";
import { DailyRewardCard, RewardCodeCard } from "@/components/DailyReward";
import { GuideBox, PopButton } from "@/components/ui-kit";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Bear Farm — Mine & Earn USDT" },
      {
        name: "description",
        content: "Start mining, claim daily rewards and redeem reward codes on the Bear Farm.",
      },
      { property: "og:title", content: "Bear Farm — Mine & Earn USDT" },
      {
        property: "og:description",
        content: "Start mining, claim daily rewards and redeem reward codes on the Bear Farm.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { user, config, serverOffset } = useAuth();
  if (!user || !config) return null;

  return (
    <div className="pb-6">
      <UserHeader user={user} />
      <BalanceCard user={user} config={config} />
      <MiningCard user={user} config={config} serverOffset={serverOffset} />

      <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
        <Link to="/tasks" className="farm-panel flex flex-col items-center gap-1 py-3">
          <ListChecks className="size-6 text-accent" />
          <span className="font-display text-xs font-bold">Task</span>
        </Link>
        <Link to="/refer" className="farm-panel flex flex-col items-center gap-1 py-3">
          <Users className="size-6 text-primary" />
          <span className="font-display text-xs font-bold">Refer</span>
        </Link>
        <Link to="/profile/wallet" className="farm-panel flex flex-col items-center gap-1 py-3">
          <Wallet className="size-6 text-usdt" />
          <span className="font-display text-xs font-bold">Withdraw</span>
        </Link>
      </div>

      <DailyRewardCard user={user} config={config} serverOffset={serverOffset} />
      <RewardCodeCard config={config} />

      <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
        <PopButton variant="accent" onClick={() => openExternal(config.communityChannelUrl)}>
          <Megaphone className="size-4" /> Community
        </PopButton>
        <PopButton variant="usdt" onClick={() => openExternal(config.paymentChannelUrl)}>
          <Banknote className="size-4" /> Payments
        </PopButton>
      </div>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Home guide 🐻"
          points={[
            `Mining gives ${config.miningRewardPerCycle} ${config.tokenSymbol} every ${config.miningCycleMinutes} minutes. It stops when the cycle ends — claim, then start again.`,
            "You get a Telegram message from the bot the moment your mining cycle completes.",
            "Daily rewards grow from day 1 to day 7. Everything resets at 00:00:00 UTC, and missing a day sends you back to day 1.",
            "Reward codes are published in the community channel; each code can be used once per account.",
            `${config.tokensPerUsd.toLocaleString()} ${config.tokenSymbol} = $1 USDT (BEP-20).`,
          ]}
        />
      </div>
    </div>
  );
}
