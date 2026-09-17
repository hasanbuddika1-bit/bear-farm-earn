import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Gift, Share2, Users } from "lucide-react";
import { toast } from "sonner";

import { api, errorMessage, newIdempotencyKey } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate, formatTokens } from "@/lib/format";
import { hapticNotify, shareReferral } from "@/lib/telegram";
import { Card, EmptyState, GuideBox, PopButton, SectionTitle, StatPill } from "@/components/ui-kit";

export const Route = createFileRoute("/refer")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Refer Friends — Bear Farm" },
      {
        name: "description",
        content: "Invite friends to Bear Farm and earn staged referral rewards up to 1200 tokens each.",
      },
      { property: "og:title", content: "Refer Friends — Bear Farm" },
      {
        property: "og:description",
        content: "Invite friends, track their progress and claim referral rewards.",
      },
    ],
  }),
  component: ReferPage,
});

const STAGE_LABEL: Record<string, { text: string; className: string }> = {
  pending: { text: "Pending", className: "bg-muted text-muted-foreground" },
  half: { text: "Half verified", className: "bg-warning/20 text-warning" },
  verified: { text: "Verified", className: "bg-success/20 text-success" },
  fake: { text: "Fake", className: "bg-destructive/20 text-destructive" },
};

function ReferPage() {
  const { user, config } = useAuth();
  const qc = useQueryClient();
  const referrals = useQuery({
    queryKey: ["referrals"],
    queryFn: () => api.listReferrals({}),
    staleTime: 60_000,
  });

  const claim = useMutation({
    mutationFn: () => api.claimReferralEarnings({ idempotencyKey: newIdempotencyKey("ref") }),
    onSuccess: (res) => {
      hapticNotify("success");
      toast.success(`🤝 Claimed ${formatTokens(res.awarded)} referral tokens`);
      void qc.invalidateQueries({ queryKey: ["referrals"] });
    },
    onError: (error) => {
      hapticNotify("error");
      toast.error(errorMessage(error));
    },
  });

  if (!user || !config) return null;
  const link = `${config.referralLink}?startapp=${user.referralCode}`;

  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <Users className="size-6 text-primary" /> Refer & Earn
        </h1>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        <StatPill label="Referrals" value={formatTokens(user.referralCount)} tone="gold" />
        <StatPill label="Active" value={formatTokens(user.activeReferralCount)} tone="green" />
        <StatPill label="Total earned" value={formatTokens(user.referralTotalEarned)} tone="usdt" />
      </div>

      <div className="mx-4 mt-4 farm-card p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Unclaimed referral rewards
        </p>
        <p className="mt-1 font-display text-3xl font-extrabold gold-text">
          {formatTokens(user.referralPendingReward)}{" "}
          <span className="text-sm text-primary">{config.tokenSymbol}</span>
        </p>
        <PopButton
          className="mt-3 w-full"
          onClick={() => claim.mutate()}
          loading={claim.isPending}
          disabled={user.referralPendingReward <= 0}
        >
          <Gift className="size-4" /> Claim to balance
        </PopButton>
      </div>

      <div className="mx-4 mt-4 farm-card p-4">
        <SectionTitle title="Your invite link" />
        <div className="rounded-xl border border-border bg-input/40 px-3 py-2 text-xs break-all">
          {link}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PopButton
            variant="muted"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              toast.success("📋 Link copied");
            }}
          >
            <Copy className="size-4" /> Copy
          </PopButton>
          <PopButton
            variant="accent"
            onClick={() => shareReferral(link, "🐻🌾 Join Bear Farm and earn USDT with me!")}
          >
            <Share2 className="size-4" /> Share
          </PopButton>
        </div>
      </div>

      <section className="mt-4 px-4">
        <SectionTitle title="How referral rewards work" />
        <Card className="space-y-2 text-xs">
          <Row
            label="Friend joins the mini app"
            value={`+${formatTokens(config.referralJoinReward)} ${config.tokenSymbol}`}
            note="Status: pending"
          />
          <Row
            label={`Friend watches ${config.referralStage1Ads} ads on day 1`}
            value={`+${formatTokens(config.referralStage1Reward)} ${config.tokenSymbol}`}
            note="Status: half verified"
          />
          <Row
            label={`Friend watches ${config.referralStage2Ads} ads on day 2`}
            value={`+${formatTokens(config.referralStage2Reward)} ${config.tokenSymbol}`}
            note="Status: verified"
          />
          <div className="border-t border-border pt-2 font-display text-sm font-extrabold">
            Total per verified friend:{" "}
            {formatTokens(
              config.referralJoinReward + config.referralStage1Reward + config.referralStage2Reward,
            )}{" "}
            {config.tokenSymbol}
          </div>
        </Card>
      </section>

      <section className="mt-4 px-4">
        <SectionTitle title="Referral history" />
        {referrals.isLoading ? (
          <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
        ) : (referrals.data?.rows ?? []).length === 0 ? (
          <Card>
            <EmptyState emoji="👥" text="No referrals yet. Share your link to get started!" />
          </Card>
        ) : (
          <div className="space-y-2">
            {referrals.data!.rows.map((row) => {
              const stage = STAGE_LABEL[row.stage] ?? STAGE_LABEL["pending"]!;
              return (
                <Card key={row.id} className="flex items-center gap-3">
                  <span className="text-xl">🐾</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold">{row.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(row.createdAt)} · {row.adsWatched} ads
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${stage.className}`}
                    >
                      {stage.text}
                    </span>
                    <p className="mt-1 text-xs font-bold text-primary">
                      +{formatTokens(row.earned)}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Referral guide 🤝"
          points={[
            "Rewards are staged: joining, day-1 ads and day-2 ads. They are added to unclaimed rewards, not directly to your balance.",
            "Self-referrals, referral loops and repeated sign-ups from the same device or IP are rejected and marked fake.",
            "Only the first account created from an IP or device stays active; the others are suspended.",
            "Your friend gets a bot message with an Open Mini App button at each reward stage.",
          ]}
        />
      </div>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-secondary/40 px-3 py-2">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="text-[10px] text-muted-foreground">{note}</p>
      </div>
      <span className="font-display font-extrabold text-primary">{value}</span>
    </div>
  );
}
