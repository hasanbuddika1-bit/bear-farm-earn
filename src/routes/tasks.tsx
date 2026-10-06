import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Handshake, ListChecks, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTokens } from "@/lib/format";
import { hapticNotify, openExternal } from "@/lib/telegram";
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
  { key: "main", label: "Main", emoji: "📢" },
  { key: "partner", label: "Partner", emoji: "🤝" },
] as const;

type TaskTab = (typeof TASK_TABS)[number]["key"];

function TasksPage() {
  const { config, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TaskTab>("main");
  const tasksQuery = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.listTasks(),
    staleTime: 5 * 60_000,
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
            "Tap Start, then Verify. The bot checks that you joined — if not, join first and verify again.",
            "After it is verified, tap Claim. The finished task moves to the bottom.",
            "Link / mini app tasks unlock Claim a few seconds after you start them. Each task pays once.",
            "Leaving a channel after claiming can flag your account for review.",
          ]}
        />
      </div>

      {tab === "main" ? (
        <TaskGroupSection
          title="Main tasks"
          icon={<Send className="size-4 text-primary" />}
          tasks={sortDone(data?.main ?? [])}
          loading={tasksQuery.isLoading}
        />
      ) : (
        <TaskGroupSection
          title="Partner tasks"
          icon={<Handshake className="size-4 text-usdt" />}
          tasks={sortDone(data?.partner ?? [])}
          loading={tasksQuery.isLoading}
        />
      )}
    </div>
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
  const [step, setStep] = useState<"start" | "verify" | "claim">("start");
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait]);

  const isChannel = task.kind === "telegram_channel";

  async function start() {
    setBusy(true);
    try {
      if (isChannel) {
        setStep("verify");
      } else {
        const res = await api.startTaskSession({ taskId: task.id });
        setWait(res.waitSeconds);
        setStep("claim");
      }
      openExternal(task.url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      const res = await api.verifyTask({ taskId: task.id });
      if (res.verified) {
        hapticNotify("success");
        toast.success(res.message);
        setStep("claim");
      } else {
        hapticNotify("error");
        toast.error(res.message, {
          action: { label: "Join", onClick: () => openExternal(task.url) },
        });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    setBusy(true);
    try {
      const res = await api.claimTask({ taskId: task.id });
      hapticNotify("success");
      toast.success(`✅ Done! +${formatTokens(res.awarded)} ${config?.tokenSymbol ?? ""}`);
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      hapticNotify("error");
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={`flex items-center gap-3 ${task.claimed ? "opacity-60" : ""}`}>
      <TaskIcon url={task.iconUrl ?? ""} fallback={isChannel ? "📢" : task.kind === "mini_app" ? "🎮" : "🔗"} />
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
        <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-xs font-bold text-success">
          <CheckCircle2 className="size-4" /> Done
        </span>
      ) : step === "start" ? (
        <PopButton variant="muted" className="!px-3 !py-2" onClick={start} loading={busy}>
          <ExternalLink className="size-4" /> Start
        </PopButton>
      ) : step === "verify" ? (
        <PopButton variant="primary" className="!px-3 !py-2" onClick={verify} loading={busy}>
          <ShieldCheck className="size-4" /> Verify
        </PopButton>
      ) : (
        <PopButton
          variant="accent"
          className="!px-3 !py-2"
          onClick={claim}
          loading={busy}
          disabled={wait > 0}
        >
          {wait > 0 ? `${wait}s` : "Claim"}
        </PopButton>
      )}
    </Card>
  );
}

/** Unfinished tasks first, completed ones sink to the bottom. */
function sortDone(tasks: TaskDoc[]): TaskDoc[] {
  return [...tasks].sort((a, b) => Number(Boolean(a.claimed)) - Number(Boolean(b.claimed)));
}

function TaskIcon({ url, fallback }: { url: string; fallback: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <span className="text-2xl">{fallback}</span>;
  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="size-10 shrink-0 rounded-xl object-cover"
    />
  );
}
