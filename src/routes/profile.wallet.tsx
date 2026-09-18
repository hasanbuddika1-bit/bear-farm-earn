import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Calculator, History, Wallet } from "lucide-react";
import { toast } from "sonner";

import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate, formatTokens, formatUsd, tokensToUsd } from "@/lib/format";
import { hapticNotify } from "@/lib/telegram";
import { Card, EmptyState, GuideBox, PopButton, SectionTitle, StatPill } from "@/components/ui-kit";

export const Route = createFileRoute("/profile/wallet")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Wallet & Withdraw — Bear Farm" },
      {
        name: "description",
        content: "Set your USDT BEP-20 wallet, request withdrawals and track payout history.",
      },
      { property: "og:title", content: "Wallet & Withdraw — Bear Farm" },
      {
        property: "og:description",
        content: "Manage your USDT BEP-20 wallet and withdrawal requests on Bear Farm.",
      },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { user, config } = useAuth();
  const qc = useQueryClient();
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [convert, setConvert] = useState("");

  const withdrawals = useQuery({
    queryKey: ["withdrawals"],
    queryFn: () => api.listWithdrawals({}),
    staleTime: 30_000,
  });
  const stats = useQuery({
    queryKey: ["payout-stats"],
    queryFn: () => api.publicPayouts({}),
    staleTime: 5 * 60_000,
  });

  const saveWallet = useMutation({
    mutationFn: () => api.setWallet({ address: address.trim() }),
    onSuccess: () => {
      hapticNotify("success");
      toast.success("💳 Wallet saved");
      setAddress("");
    },
    onError: (error) => {
      hapticNotify("error");
      toast.error(errorMessage(error));
    },
  });

  const requestWithdraw = useMutation({
    mutationFn: () =>
      api.requestWithdrawal({
        amountTokens: Number(amount),
        idempotencyKey: newIdempotencyKey("wd"),
      }),
    onSuccess: () => {
      hapticNotify("success");
      toast.success("📤 Withdrawal request sent for review");
      setAmount("");
      void qc.invalidateQueries({ queryKey: ["withdrawals"] });
    },
    onError: (error) => {
      hapticNotify("error");
      toast.error(errorMessage(error));
    },
  });

  if (!user || !config) return null;

  const minTokens =
    user.withdrawalCount === 0 ? config.firstWithdrawMinTokens : config.nextWithdrawMinTokens;
  const gross = tokensToUsd(Number(amount) || 0, config.tokensPerUsd);
  const fee = gross > 0 ? config.withdrawFeeFlatUsd + gross * (config.withdrawFeePercent / 100) : 0;
  const net = Math.max(0, gross - fee);

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Link to="/profile" className="farm-panel !p-2">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Wallet className="size-5 text-usdt" /> Wallet
        </h1>
      </div>

      <Card className="mx-4 mt-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Available balance
        </p>
        <p className="font-display text-3xl font-extrabold gold-text">
          {formatTokens(user.balance)} <span className="text-sm text-primary">{config.tokenSymbol}</span>
        </p>
        <p className="text-sm font-bold text-usdt">
          ≈ {formatUsd(tokensToUsd(user.balance, config.tokensPerUsd))}
        </p>
      </Card>

      <section className="mt-4 px-4">
        <SectionTitle title="USDT BEP-20 wallet" />
        <Card>
          <p className="text-xs text-muted-foreground">
            Current: {user.walletAddress ? user.walletAddress : "not set yet"}
          </p>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x… BEP-20 address"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border border-input bg-input/50 px-3 py-3 text-sm outline-none focus:border-primary"
          />
          <PopButton
            className="mt-2 w-full"
            variant="usdt"
            loading={saveWallet.isPending}
            disabled={address.trim().length < 10}
            onClick={() => saveWallet.mutate()}
          >
            {user.walletAddress ? "Change wallet" : "Set wallet"}
          </PopButton>
        </Card>
      </section>

      <section className="mt-4 px-4">
        <SectionTitle title="Withdraw" />
        <Card>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Minimum: {formatTokens(minTokens)} {config.tokenSymbol}</span>
            <span>Fee: ${config.withdrawFeeFlatUsd} + {config.withdrawFeePercent}%</span>
          </div>
          <input
            value={amount}
            inputMode="numeric"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={`Amount in ${config.tokenSymbol}`}
            className="mt-2 w-full rounded-xl border border-input bg-input/50 px-3 py-3 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 space-y-1 rounded-xl bg-secondary/40 px-3 py-2 text-xs">
            <Line label="Gross" value={formatUsd(gross)} />
            <Line label="Withdraw fee" value={`- ${formatUsd(fee)}`} />
            <Line label="Net payout" value={formatUsd(net)} strong />
          </div>
          <PopButton
            className="mt-2 w-full"
            loading={requestWithdraw.isPending}
            disabled={!user.walletAddress || Number(amount) < minTokens || Number(amount) > user.balance}
            onClick={() => requestWithdraw.mutate()}
          >
            <ArrowUpRight className="size-4" /> Request withdrawal
          </PopButton>
          {!user.walletAddress ? (
            <p className="mt-2 text-center text-[11px] text-warning">Set your wallet first ⚠️</p>
          ) : null}
        </Card>
      </section>

      <div className="mx-4 mt-4 grid grid-cols-2 gap-2">
        <StatPill
          label="Total paid out"
          value={formatUsd(stats.data?.totalPaidUsd ?? 0)}
          tone="usdt"
        />
        <StatPill label="Pending" value={formatUsd(stats.data?.pendingUsd ?? 0)} tone="gold" />
      </div>

      <section className="mt-4 px-4">
        <SectionTitle icon={<Calculator className="size-4 text-accent" />} title="Converter" />
        <Card>
          <input
            value={convert}
            inputMode="numeric"
            onChange={(e) => setConvert(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={`Tokens → USD`}
            className="w-full rounded-xl border border-input bg-input/50 px-3 py-3 text-sm outline-none focus:border-primary"
          />
          <p className="mt-2 text-center font-display text-lg font-extrabold text-usdt">
            {formatTokens(Number(convert) || 0)} {config.tokenSymbol} ={" "}
            {formatUsd(tokensToUsd(Number(convert) || 0, config.tokensPerUsd))}
          </p>
        </Card>
      </section>

      <section className="mt-4 px-4">
        <SectionTitle icon={<History className="size-4 text-primary" />} title="Withdrawal history" />
        {withdrawals.isLoading ? (
          <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
        ) : (withdrawals.data?.rows ?? []).length === 0 ? (
          <Card>
            <EmptyState emoji="🧾" text="No withdrawals yet." />
          </Card>
        ) : (
          <div className="space-y-2">
            {withdrawals.data!.rows.map((row) => (
              <Card key={row.id} className="flex items-center gap-3">
                <span className="text-xl">
                  {row.status === "approved" ? "✅" : row.status === "rejected" ? "❌" : "⏳"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold">
                    #{row.number} · {formatTokens(row.amountTokens)} {config.tokenSymbol}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{formatDate(row.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="font-display text-sm font-extrabold text-usdt">
                    {formatUsd(row.netUsd)}
                  </p>
                  <p className="text-[10px] uppercase text-muted-foreground">{row.status}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Withdraw guide 💸"
          points={[
            `First withdrawal minimum is ${formatTokens(config.firstWithdrawMinTokens)} ${config.tokenSymbol}; after that it is ${formatTokens(config.nextWithdrawMinTokens)}.`,
            `Fee is $${config.withdrawFeeFlatUsd} plus ${config.withdrawFeePercent}% of the amount.`,
            "Only USDT BEP-20 addresses are accepted, and one address belongs to one account only.",
            "Approved payouts are posted in the payment channel and sent to you by the bot with the transaction link.",
          ]}
        />
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-display font-extrabold text-usdt" : "font-semibold"}>
        {value}
      </span>
    </div>
  );
}
