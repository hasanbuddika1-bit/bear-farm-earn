import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Handshake, ListChecks, Send, Share2 } from "lucide-react";
import { toast } from "sonner";

import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTokens } from "@/lib/format";
import { hapticNotify, openExternal, shareReferral } from "@/lib/telegram";
import { Card, EmptyState, GuideBox, PopButton, SectionTitle } from "@/components/ui-kit";
import type { TaskDoc } from "@/lib/types";

export const Route = createFileRoute("/tasks")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tasks — Bear Farm" },
      {
        name: "description",
        content: "Daily, main and partner tasks. Join channels, complete offers and earn Bear Farm tokens.",
      },
      { property: "og:title", content: "Tasks — Bear Farm" },
      {
        property: "og:description",
        content: "Complete daily, main and partner tasks to grow your Bear Farm balance.",
      },
    ],
  }),
  component: TasksPage,
});

const TASK_TABS = [
  { key: "daily", label: "Daily", emoji: "🗓️" },
  { key: "main", label: "Main", emoji: "📢" },
  { key: "partner", label: "Partner", emoji: "🤝" },
] as const;

type TaskTab = (typeof TASK_TABS)[number]["key"];

function TasksPage() {
  const { config, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TaskTab>("daily");
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.listTasks(),
    staleTime: 5 * 60_000,
  });

  const claimDaily = useMutation({
    mutationFn: (key: string) => api.claimDailyTask({ key }),
    onSuccess: (res) => {
      hapticNotify("success");
      toast.success(`✅ +${formatTokens(res.awarded)} ${config?.tokenSymbol ?? ""}`);
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      hapticNotify("error");
      toast.error(errorMessage(error));
    },
  });

  if (!config || !user) return null;
  const data = tasksQuery.data;

  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <ListChecks className="size-6 text-accent" /> Tasks
        </h1>
        <p className="text-xs text-muted-foreground">
          Balance: {formatTokens(user.balance)} {config.tokenSymbol}
        </p>
      </div>

      {/* Horizontal tab switcher — one group open at a time */}
      <div className="sticky top-0 z-10 mt-3 bg-background/90 px-4 py-2 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto">
          {TASK_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-xl border px-3 py-2 font-display text-xs font-extrabold whitespace-nowrap transition ${
                tab === t.key
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-border bg-secondary/40 text-muted-foreground"
              }`}
            >
              <span className="mr-1">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-2">
        <GuideBox
          title="Task guide 📋"
          points={[
            "Channel tasks are verified by the bot. If you are not a member, no reward is given — join first, then claim.",
            "Mini app / link tasks unlock the claim button 5 seconds after you open the link.",
            "Daily tasks reset at 00:00:00 UTC. Main and partner tasks can be claimed once.",
            "Leaving a channel after claiming can flag your account for review.",
          ]}
        />
      </div>

      {tab === "daily" ? (
        <section className="mt-4 px-4">
          <SectionTitle icon={<Send className="size-4 text-accent" />} title="Daily tasks" />
          <div className="space-y-2">
            <DailyTaskRow
              emoji="📣"
              title="Visit the community channel"
              reward={config.dailyTaskCommunityReward}
              symbol={config.tokenSymbol}
              actionLabel="Open"
              onAction={() => openExternal(config.communityChannelUrl)}
              claiming={claimDaily.isPending}
              onClaim={() => claimDaily.mutate("community")}
            />
            <DailyTaskRow
              emoji="💸"
              title="Visit the payment channel"
              reward={config.dailyTaskPaymentReward}
              symbol={config.tokenSymbol}
              actionLabel="Open"
              onAction={() => openExternal(config.paymentChannelUrl)}
              claiming={claimDaily.isPending}
              onClaim={() => claimDaily.mutate("payment")}
            />
            <DailyTaskRow
              emoji="🤝"
              title="Invite 1 friend today"
              reward={config.dailyReferralTaskReward}
              symbol={config.tokenSymbol}
              actionLabel="Share"
              actionIcon={<Share2 className="size-4" />}
              onAction={() =>
                shareReferral(
                  `${config.referralLink}?startapp=${user.referralCode}`,
                  "🐻🌾 Join Bear Farm and earn USDT!",
                )
              }
              claiming={claimDaily.isPending}
              onClaim={() => claimDaily.mutate("referral")}
            />
          </div>
        </section>
      ) : tab === "main" ? (
        <TaskGroupSection
          title="Main tasks"
          icon={<Send className="size-4 text-primary" />}
          tasks={data?.main ?? []}
          loading={tasksQuery.isLoading}
        />
      ) : (
        <TaskGroupSection
          title="Partner tasks"
          icon={<Handshake className="size-4 text-usdt" />}
          tasks={data?.partner ?? []}
          loading={tasksQuery.isLoading}
        />
      )}
    </div>
  );
}

function DailyTaskRow({
  emoji,
  title,
  reward,
  symbol,
  actionLabel,
  actionIcon,
  onAction,
  onClaim,
  claiming,
}: {
  emoji: string;
  title: string;
  reward: number;
  symbol: string;
  actionLabel: string;
  actionIcon?: React.ReactNode;
  onAction: () => void;
  onClaim: () => void;
  claiming: boolean;
}) {
  return (
    <Card className="flex items-center gap-3">
      <span className="text-2xl">{emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{title}</p>
        <p className="text-xs text-primary">
          +{formatTokens(reward)} {symbol}
        </p>
      </div>
      <PopButton variant="muted" className="!px-3 !py-2" onClick={onAction}>
        {actionIcon ?? <ExternalLink className="size-4" />} {actionLabel}
      </PopButton>
      <PopButton variant="accent" className="!px-3 !py-2" onClick={onClaim} loading={claiming}>
        Claim
      </PopButton>
    </Card>
  );
}

function TaskGroupSection({
  title,
  icon,
  tasks,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  tasks: TaskDoc[];
  loading: boolean;
}) {
  return (
    <section className="mt-5 px-4">
      <SectionTitle icon={icon} title={title} />
      {loading ? (
        <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
      ) : tasks.length === 0 ? (
        <Card>
          <EmptyState emoji="🌱" text="No tasks here right now. Check back soon!" />
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task }: { task: TaskDoc }) {
  const { config } = useAuth();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait]);

  const isChannel = task.kind === "telegram_channel";

  async function open() {
    if (!isChannel) {
      try {
        const res = await api.startTaskSession({ taskId: task.id });
        setSessionId(res.sessionId);
        setWait(res.waitSeconds);
      } catch (error) {
        toast.error(errorMessage(error));
        return;
      }
    }
    openExternal(task.url);
  }

  async function claim() {
    setBusy(true);
    try {
      const res = await api.claimTask({
        taskId: task.id,
        ...(sessionId ? { sessionId } : {}),
      });
      hapticNotify("success");
      toast.success(`✅ +${formatTokens(res.awarded)} ${config?.tokenSymbol ?? ""}`);
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      hapticNotify("error");
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const canClaim = isChannel || (sessionId !== null && wait === 0);

  return (
    <Card className="flex items-center gap-3">
      <span className="text-2xl">{isChannel ? "📢" : task.kind === "mini_app" ? "🎮" : "🔗"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-bold">{task.title}</p>
        {task.description ? (
          <p className="truncate text-[11px] text-muted-foreground">{task.description}</p>
        ) : null}
        <p className="text-xs text-primary">
          +{formatTokens(task.reward)} {config?.tokenSymbol}
        </p>
      </div>
      {task.claimed ? (
        <span className="flex items-center gap-1 text-xs font-bold text-success">
          <CheckCircle2 className="size-4" /> Done
        </span>
      ) : (
        <>
          <PopButton variant="muted" className="!px-3 !py-2" onClick={open}>
            <ExternalLink className="size-4" /> Open
          </PopButton>
          <PopButton
            variant="accent"
            className="!px-3 !py-2"
            onClick={claim}
            loading={busy}
            disabled={!canClaim}
          >
            {wait > 0 ? `${wait}s` : "Claim"}
          </PopButton>
        </>
      )}
    </Card>
  );
}
