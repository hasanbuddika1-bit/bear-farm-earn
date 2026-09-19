import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  ClipboardList,
  KeyRound,
  ListChecks,
  Lock,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, EmptyState, GuideBox, PopButton, SectionTitle } from "@/components/ui-kit";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin Panel — Bear Farm" },
      { name: "description", content: "Bear Farm operator console." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin Panel — Bear Farm" },
      { property: "og:description", content: "Bear Farm operator console." },
    ],
  }),
  component: AdminPage,
});

const TABS = [
  { key: "overview", label: "Overview", icon: ShieldCheck },
  { key: "users", label: "Users", icon: Users },
  { key: "withdrawals", label: "Withdrawals", icon: Banknote },
  { key: "tasks", label: "Tasks", icon: ListChecks },
  { key: "codes", label: "Codes", icon: KeyRound },
  { key: "config", label: "Config", icon: Settings2 },
  { key: "audit", label: "Audit log", icon: ScrollText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function AdminPage() {
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");

  if (!user) return null;

  if (!user.isAdmin) {
    return (
      <div className="px-4 py-16 text-center">
        <p className="text-4xl">🚫</p>
        <h1 className="mt-3 font-display text-xl font-extrabold">Not available</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This area is only for the farm operator.
        </p>
        <Link to="/" className="mt-4 inline-block text-sm font-bold text-primary">
          Back to the farm
        </Link>
      </div>
    );
  }

  if (!unlocked) return <AdminLogin onDone={() => setUnlocked(true)} />;

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Link to="/profile" className="farm-panel !p-2">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <ShieldCheck className="size-5 text-barn" /> Admin panel
        </h1>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition-colors ${
              tab === key ? "bg-primary text-primary-foreground" : "farm-panel"
            }`}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="mt-3 px-4">
        {tab === "overview" ? <Overview /> : null}
        {tab === "users" ? <UsersTab /> : null}
        {tab === "withdrawals" ? <WithdrawalsTab /> : null}
        {tab === "tasks" ? <TasksTab /> : null}
        {tab === "codes" ? <CodesTab /> : null}
        {tab === "config" ? <ConfigTab /> : null}
        {tab === "audit" ? <ResourceList resource="audit" emoji="📜" /> : null}
      </div>

      <div className="mx-4 mt-4">
        <GuideBox
          title="Admin guide 🛠️"
          points={[
            "Every action here is checked server-side against your admin claim and written to the audit log.",
            "Approving a withdrawal requires a transaction ID; the bot then notifies the user and posts to the payment channel.",
            "Suspending an account blocks all earning and withdrawing immediately.",
            "Config changes (mining reward, cycle length, task and referral values) apply to all users instantly.",
          ]}
        />
      </div>
    </div>
  );
}

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api.adminLogin({ username: username.trim(), password }),
    onSuccess: () => {
      toast.success("🔓 Admin session started");
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="px-4 py-10">
      <Card className="mx-auto max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-barn/15">
            <Lock className="size-6 text-barn" />
          </div>
          <h1 className="mt-3 font-display text-xl font-extrabold">Admin sign in</h1>
          <p className="text-xs text-muted-foreground">Second factor for the operator console.</p>
        </div>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="off"
          className="mt-4 w-full rounded-xl border border-input bg-input/50 px-3 py-3 text-sm outline-none focus:border-primary"
        />
        <input
          value={password}
          type="password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="off"
          className="mt-2 w-full rounded-xl border border-input bg-input/50 px-3 py-3 text-sm outline-none focus:border-primary"
        />
        <PopButton
          className="mt-3 w-full"
          loading={login.isPending}
          disabled={!username || !password}
          onClick={() => login.mutate()}
        >
          Unlock
        </PopButton>
      </Card>
    </div>
  );
}

function useAdminList(resource: string, query?: string) {
  return useQuery({
    queryKey: ["admin", resource, query ?? ""],
    queryFn: () => api.adminList({ resource, ...(query ? { query } : {}) }),
    staleTime: 30_000,
  });
}

function useAdminAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { action: string; payload: Record<string, unknown> }) =>
      api.adminAction(vars),
    onSuccess: (res) => {
      toast.success(res.message ?? "✅ Done");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function str(row: Record<string, unknown>, key: string) {
  const v = row[key];
  return v === undefined || v === null ? "" : String(v);
}

function Overview() {
  const list = useAdminList("overview");
  const stats = list.data?.stats ?? {};
  const entries = Object.entries(stats);

  return (
    <div>
      <SectionTitle title="Farm statistics" />
      {list.isLoading ? (
        <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState emoji="📊" text="No statistics yet." />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {entries.map(([key, value]) => (
            <Card key={key}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {key.replace(/([A-Z])/g, " $1")}
              </p>
              <p className="font-display text-xl font-extrabold gold-text">
                {value.toLocaleString()}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const list = useAdminList("users", applied);
  const action = useAdminAction();

  return (
    <div>
      <SectionTitle title="Users" />
      <div className="mb-2 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Telegram ID or username"
          className="flex-1 rounded-xl border border-input bg-input/50 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <PopButton variant="muted" onClick={() => setApplied(search.trim())}>
          Search
        </PopButton>
      </div>
      {list.isLoading ? (
        <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
      ) : (list.data?.rows ?? []).length === 0 ? (
        <Card>
          <EmptyState emoji="👥" text="No users found." />
        </Card>
      ) : (
        <div className="space-y-2">
          {list.data!.rows.map((row) => {
            const suspended = row["suspended"] === true;
            const id = str(row, "id");
            return (
              <Card key={id}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{suspended ? "🚫" : "🐻"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold">
                      {str(row, "username") || str(row, "firstName") || id}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      ID {str(row, "telegramId")} · balance {str(row, "balance")} · refs{" "}
                      {str(row, "referralCount")}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <PopButton
                    variant={suspended ? "accent" : "muted"}
                    className="!px-3 !py-2 text-xs"
                    loading={action.isPending}
                    onClick={() =>
                      action.mutate({
                        action: suspended ? "unsuspendUser" : "suspendUser",
                        payload: { userId: id },
                      })
                    }
                  >
                    {suspended ? "Unsuspend" : "Suspend"}
                  </PopButton>
                  <PopButton
                    variant="muted"
                    className="!px-3 !py-2 text-xs"
                    onClick={() => {
                      const amount = window.prompt("Adjust balance by (tokens, can be negative)");
                      if (!amount) return;
                      action.mutate({
                        action: "adjustBalance",
                        payload: { userId: id, amount: Number(amount) },
                      });
                    }}
                  >
                    Adjust balance
                  </PopButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WithdrawalsTab() {
  const list = useAdminList("withdrawals");
  const action = useAdminAction();

  return (
    <div>
      <SectionTitle title="Withdrawal requests" />
      {list.isLoading ? (
        <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
      ) : (list.data?.rows ?? []).length === 0 ? (
        <Card>
          <EmptyState emoji="💸" text="No withdrawal requests." />
        </Card>
      ) : (
        <div className="space-y-2">
          {list.data!.rows.map((row) => {
            const id = str(row, "id");
            const status = str(row, "status");
            return (
              <Card key={id}>
                <p className="font-display text-sm font-bold">
                  #{str(row, "number")} · {str(row, "amountTokens")} tokens → $
                  {str(row, "netUsd")}
                </p>
                <p className="break-all text-[11px] text-muted-foreground">
                  {str(row, "username") || str(row, "telegramId")} · {str(row, "address")}
                </p>
                <p className="mt-1 text-[11px] uppercase text-muted-foreground">{status}</p>
                {status === "pending" ? (
                  <div className="mt-2 flex gap-2">
                    <PopButton
                      variant="usdt"
                      className="!px-3 !py-2 text-xs"
                      loading={action.isPending}
                      onClick={() => {
                        const txId = window.prompt("Transaction ID (TX hash)");
                        if (!txId) return;
                        action.mutate({
                          action: "approveWithdrawal",
                          payload: { withdrawalId: id, txId },
                        });
                      }}
                    >
                      Approve
                    </PopButton>
                    <PopButton
                      variant="muted"
                      className="!px-3 !py-2 text-xs"
                      onClick={() => {
                        const reason = window.prompt("Rejection reason");
                        if (!reason) return;
                        action.mutate({
                          action: "rejectWithdrawal",
                          payload: { withdrawalId: id, reason },
                        });
                      }}
                    >
                      Reject
                    </PopButton>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TasksTab() {
  const list = useAdminList("tasks");
  const action = useAdminAction();
  const [form, setForm] = useState({
    group: "main",
    kind: "telegram_channel",
    title: "",
    description: "",
    url: "",
    chatId: "",
    reward: "",
  });

  return (
    <div>
      <SectionTitle icon={<ClipboardList className="size-4 text-accent" />} title="Add a task" />
      <Card className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={form.group}
            onChange={(e) => setForm({ ...form, group: e.target.value })}
            className="rounded-xl border border-input bg-input/50 px-3 py-2.5 text-sm"
          >
            <option value="main">Main</option>
            <option value="partner">Partner</option>
          </select>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            className="rounded-xl border border-input bg-input/50 px-3 py-2.5 text-sm"
          >
            <option value="telegram_channel">Telegram channel</option>
            <option value="mini_app">Mini app</option>
            <option value="link">Link</option>
          </select>
        </div>
        {(
          [
            ["title", "Title"],
            ["description", "Description"],
            ["url", "URL"],
            ["chatId", "Channel chat ID / @username (channel tasks)"],
            ["reward", "Reward tokens"],
          ] as const
        ).map(([key, placeholder]) => (
          <input
            key={key}
            value={form[key]}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            placeholder={placeholder}
            className="w-full rounded-xl border border-input bg-input/50 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        ))}
        <PopButton
          className="w-full"
          loading={action.isPending}
          disabled={!form.title || !form.url || !form.reward}
          onClick={() =>
            action.mutate({
              action: "createTask",
              payload: { ...form, reward: Number(form.reward) },
            })
          }
        >
          Create task
        </PopButton>
      </Card>

      <div className="mt-4">
        <SectionTitle title="Existing tasks" />
        {list.isLoading ? (
          <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
        ) : (list.data?.rows ?? []).length === 0 ? (
          <Card>
            <EmptyState emoji="📋" text="No tasks created yet." />
          </Card>
        ) : (
          <div className="space-y-2">
            {list.data!.rows.map((row) => {
              const id = str(row, "id");
              const active = row["active"] !== false;
              return (
                <Card key={id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold">{str(row, "title")}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {str(row, "group")} · {str(row, "kind")} · {str(row, "reward")} tokens ·{" "}
                      {active ? "active" : "hidden"}
                    </p>
                  </div>
                  <PopButton
                    variant="muted"
                    className="!px-2.5 !py-2 text-xs"
                    onClick={() => {
                      const reward = window.prompt("New reward", str(row, "reward"));
                      if (!reward) return;
                      action.mutate({
                        action: "updateTask",
                        payload: { taskId: id, reward: Number(reward) },
                      });
                    }}
                  >
                    Edit
                  </PopButton>
                  <PopButton
                    variant="muted"
                    className="!px-2.5 !py-2 text-xs"
                    onClick={() =>
                      action.mutate({
                        action: "updateTask",
                        payload: { taskId: id, active: !active },
                      })
                    }
                  >
                    {active ? "Hide" : "Show"}
                  </PopButton>
                  <PopButton
                    variant="muted"
                    className="!px-2.5 !py-2 text-xs"
                    onClick={() => {
                      if (!window.confirm("Delete this task?")) return;
                      action.mutate({ action: "deleteTask", payload: { taskId: id } });
                    }}
                  >
                    ✕
                  </PopButton>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function CodesTab() {
  const list = useAdminList("codes");
  const action = useAdminAction();
  const [form, setForm] = useState({ code: "", reward: "", maxClaims: "" });

  return (
    <div>
      <SectionTitle title="Reward codes" />
      <Card className="space-y-2">
        <input
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          placeholder="CODE"
          className="w-full rounded-xl border border-input bg-input/50 px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={form.reward}
            onChange={(e) => setForm({ ...form, reward: e.target.value })}
            placeholder="Reward tokens"
            className="rounded-xl border border-input bg-input/50 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={form.maxClaims}
            onChange={(e) => setForm({ ...form, maxClaims: e.target.value })}
            placeholder="Max claims"
            className="rounded-xl border border-input bg-input/50 px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </div>
        <PopButton
          className="w-full"
          loading={action.isPending}
          disabled={!form.code || !form.reward}
          onClick={() =>
            action.mutate({
              action: "createRewardCode",
              payload: {
                code: form.code,
                reward: Number(form.reward),
                maxClaims: Number(form.maxClaims) || 0,
              },
            })
          }
        >
          Create code
        </PopButton>
      </Card>

      <div className="mt-3 space-y-2">
        {(list.data?.rows ?? []).map((row) => {
          const id = str(row, "id");
          return (
            <Card key={id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold">{str(row, "code")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {str(row, "reward")} tokens · {str(row, "claims")}/{str(row, "maxClaims")} claims
                </p>
              </div>
              <PopButton
                variant="muted"
                className="!px-2.5 !py-2 text-xs"
                onClick={() => {
                  if (!window.confirm("Disable this code?")) return;
                  action.mutate({ action: "disableRewardCode", payload: { codeId: id } });
                }}
              >
                Disable
              </PopButton>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ConfigTab() {
  const list = useAdminList("config");
  const action = useAdminAction();
  const rows = list.data?.rows ?? [];

  return (
    <div>
      <SectionTitle title="System configuration" />
      {list.isLoading ? (
        <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState emoji="⚙️" text="Configuration not loaded." />
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const key = str(row, "key");
            return (
              <Card key={key} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-bold">{key}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{str(row, "value")}</p>
                </div>
                <PopButton
                  variant="muted"
                  className="!px-2.5 !py-2 text-xs"
                  loading={action.isPending}
                  onClick={() => {
                    const value = window.prompt(`New value for ${key}`, str(row, "value"));
                    if (value === null) return;
                    action.mutate({ action: "updateConfig", payload: { key, value } });
                  }}
                >
                  Edit
                </PopButton>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResourceList({ resource, emoji }: { resource: string; emoji: string }) {
  const list = useAdminList(resource);
  const rows = list.data?.rows ?? [];

  return (
    <div>
      <SectionTitle title="Audit log" />
      {list.isLoading ? (
        <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState emoji={emoji} text="Nothing recorded yet." />
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <Card key={i}>
              <p className="font-display text-sm font-bold">{str(row, "action")}</p>
              <p className="break-all text-[11px] text-muted-foreground">
                admin {str(row, "adminId")} → {str(row, "targetId")} · {str(row, "createdAt")}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
