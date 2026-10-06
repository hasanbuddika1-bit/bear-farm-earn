import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Banknote,
  ClipboardList,
  KeyRound,
  ListChecks,
  PlayCircle,
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
  { key: "ads", label: "Ad networks", icon: PlayCircle },
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
        {tab === "ads" ? <AdsTab /> : null}
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
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mt-4 w-full rounded-xl border border-input bg-input/50 px-3 py-3 text-sm outline-none focus:border-primary"
        />
        <input
          value={password}
          type="password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
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
  const action = useAdminAction();

  return (
    <div>
      <Card className="mb-3">
        <p className="font-display text-sm font-bold">🤖 Telegram bot</p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Tap once from the live site so /start and welcome messages work.
        </p>
        <PopButton
          variant="accent"
          className="w-full !py-2 text-xs"
          loading={action.isPending}
          onClick={() => action.mutate({ action: "connectBot", payload: {} })}
        >
          Connect bot
        </PopButton>
      </Card>
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
  const [openId, setOpenId] = useState<string | null>(null);

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
      <div className="mb-2 flex gap-2">
        <PopButton
          variant={applied === "" ? "accent" : "muted"}
          className="flex-1 !py-2 text-xs"
          onClick={() => {
            setSearch("");
            setApplied("");
          }}
        >
          👥 All users
        </PopButton>
        <PopButton
          variant={applied === "__suspended" ? "danger" : "muted"}
          className="flex-1 !py-2 text-xs"
          onClick={() => setApplied("__suspended")}
        >
          🚫 Suspended
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
                    {suspended && str(row, "suspendedReason") ? (
                      <p className="text-[11px] text-destructive">⚠️ {str(row, "suspendedReason")}</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <PopButton
                    variant="muted"
                    className="!px-3 !py-2 text-xs"
                    onClick={() => setOpenId(openId === id ? null : id)}
                  >
                    📋 Activity
                  </PopButton>
                  <PopButton
                    variant="muted"
                    className="!px-3 !py-2 text-xs"
                    loading={action.isPending}
                    onClick={() => action.mutate({ action: "checkUser", payload: { userId: id } })}
                  >
                    🔍 Check
                  </PopButton>
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
                    variant="accent"
                    className="!px-3 !py-2 text-xs"
                    onClick={() => {
                      const amount = window.prompt("Add balance (tokens)");
                      const n = Math.floor(Number(amount));
                      if (!amount || !Number.isFinite(n) || n <= 0) return;
                      action.mutate({ action: "adjustBalance", payload: { userId: id, amount: n } });
                    }}
                  >
                    + Add balance
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
                {openId === id ? <UserActivity userId={id} /> : null}
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
                <p className="text-[11px] text-muted-foreground">
                  {str(row, "username") || str(row, "telegramId")}
                </p>
                <div className="mt-1 flex items-center gap-2 rounded-lg bg-secondary/50 px-2 py-1.5">
                  <code className="min-w-0 flex-1 break-all text-[11px]">{str(row, "address")}</code>
                  <button
                    type="button"
                    className="shrink-0 rounded-md bg-primary/20 px-2 py-1 text-[11px] font-bold text-primary"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(str(row, "address"))
                        .then(() => toast.success("📋 Address copied"))
                        .catch(() => toast.error("Could not copy"));
                    }}
                  >
                    Copy
                  </button>
                </div>
                {status === "pending" ? (
                  row["balanceOk"] === true ? (
                    <p className="mt-1 text-[11px] font-bold text-success">✅ Balance matches the records</p>
                  ) : row["balanceOk"] === false ? (
                    <p className="mt-1 text-[11px] font-bold text-destructive">
                      🚨 Balance problem: {str(row, "balanceIssue")}
                    </p>
                  ) : null
                ) : null}
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
    iconUrl: "",
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
            ["iconUrl", "Icon image link (https://i.ibb.co/…)"],
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
                  <TaskIcon url={str(row, "iconUrl")} fallback="📋" />
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
                    onClick={() => {
                      const iconUrl = window.prompt("Icon image link (https)", str(row, "iconUrl"));
                      if (iconUrl === null) return;
                      action.mutate({ action: "updateTask", payload: { taskId: id, iconUrl } });
                    }}
                  >
                    Icon
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

function TaskIcon({ url, fallback }: { url: string; fallback: string }) {
  const [broken, setBroken] = useState(false);
  if (!url || broken) return <span className="text-2xl">{fallback}</span>;
  return (
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="size-9 shrink-0 rounded-lg object-cover"
    />
  );
}

const AD_FIELDS = [
  ["name", "Name"],
  ["blockId", "Block / zone ID"],
  ["url", "Ad link (https)"],
  ["logoUrl", "Logo image link (https)"],
  ["reward", "Reward tokens"],
  ["dailyLimit", "Daily limit"],
  ["cooldownSecs", "Cooldown seconds"],
  ["minWatchSecs", "Minimum watch seconds"],
] as const;

function AdsTab() {
  const list = useAdminList("adnetworks");
  return (
    <div>
      <SectionTitle icon={<PlayCircle className="size-4 text-primary" />} title="Ad networks" />
      {list.isLoading ? (
        <Card className="animate-pulse text-center text-sm text-muted-foreground">Loading…</Card>
      ) : null}
      <NewAdNetwork />
      {list.isLoading ? null : (list.data?.rows ?? []).length === 0 ? (
        <Card>
          <EmptyState emoji="📺" text="No ads yet. Add one above." />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.data!.rows.map((row) => (
            <AdNetworkEditor key={str(row, "id")} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewAdNetwork() {
  const action = useAdminAction();
  const [form, setForm] = useState<Record<string, string>>({ provider: "link" });
  const inputCls =
    "mt-0.5 w-full rounded-xl border border-input bg-input/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary";
  return (
    <Card className="mb-3 space-y-2">
      <p className="font-display text-sm font-bold">➕ Add ad / visit site</p>
      <label className="block text-[11px] text-muted-foreground">
        Type
        <select
          value={form["provider"]}
          onChange={(e) => setForm({ ...form, provider: e.target.value })}
          className={inputCls}
        >
          <option value="link">Visit site (link)</option>
          <option value="adsgram">Adsgram</option>
          <option value="monetag">Monetag</option>
          <option value="gigapub">GigaPub</option>
        </select>
      </label>
      <label className="block text-[11px] text-muted-foreground">
        ID (a-z, 0-9, _)
        <input value={form["id"] ?? ""} onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })} className={inputCls} />
      </label>
      {AD_FIELDS.map(([key, label]) => (
        <label key={key} className="block text-[11px] text-muted-foreground">
          {label}
          <input value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputCls} />
        </label>
      ))}
      <PopButton
        className="w-full"
        loading={action.isPending}
        onClick={() =>
          action.mutate(
            { action: "upsertAdNetwork", payload: { ...form, create: true } },
            { onSuccess: () => setForm({ provider: "link" }) },
          )
        }
      >
        Add
      </PopButton>
    </Card>
  );
}

function AdNetworkEditor({ row }: { row: Record<string, unknown> }) {
  const action = useAdminAction();
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(AD_FIELDS.map(([k]) => [k, str(row, k)])),
  );
  const active = row["active"] !== false;
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <TaskIcon url={form["logoUrl"] ?? ""} fallback="📺" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold">{str(row, "name")}</p>
          <p className="text-[11px] text-muted-foreground">
            {str(row, "id")} · {str(row, "provider")} · {active ? "active" : "paused"}
          </p>
        </div>
        <PopButton
          variant="muted"
          className="!px-2.5 !py-2 text-xs"
          onClick={() =>
            action.mutate({ action: "upsertAdNetwork", payload: { id: str(row, "id"), active: !active } })
          }
        >
          {active ? "Pause" : "Enable"}
        </PopButton>
      </div>
      {AD_FIELDS.map(([key, label]) => (
        <label key={key} className="block text-[11px] text-muted-foreground">
          {label}
          <input
            value={form[key] ?? ""}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            className="mt-0.5 w-full rounded-xl border border-input bg-input/50 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
      ))}
      <PopButton
        className="w-full"
        loading={action.isPending}
        onClick={() => action.mutate({ action: "upsertAdNetwork", payload: { id: str(row, "id"), ...form } })}
      >
        Save
      </PopButton>
      <PopButton
        variant="danger"
        className="w-full"
        onClick={() => {
          if (confirm("Remove this ad?")) action.mutate({ action: "deleteAdNetwork", payload: { id: str(row, "id") } });
        }}
      >
        Remove
      </PopButton>
    </Card>
  );
}

function UserActivity({ userId }: { userId: string }) {
  const list = useAdminList("activity", userId);
  const stats = list.data?.stats;
  if (list.isLoading) return <p className="mt-2 text-xs text-muted-foreground">Loading activity…</p>;
  return (
    <div className="mt-2 rounded-xl border border-border bg-background/40 p-2">
      {stats ? (
        <p className={`mb-1 text-[11px] font-bold ${stats["ok"] ? "text-success" : "text-destructive"}`}>
          {stats["ok"] ? "✅" : "🚨"} Balance {stats["balance"]} · records {stats["ledger"]} · last hour +
          {stats["lastHourEarned"]}
        </p>
      ) : null}
      {(list.data?.rows ?? []).length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No activity yet.</p>
      ) : (
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {list.data!.rows.map((r) => {
            const amount = Number(r["amount"] ?? 0);
            return (
              <div key={str(r, "id")} className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate">{str(r, "label") || str(r, "kind")}</span>
                <span className="text-muted-foreground">
                  {new Date(str(r, "createdAt")).toISOString().slice(5, 16).replace("T", " ")}
                </span>
                <span className={`w-16 text-right font-bold ${amount >= 0 ? "text-success" : "text-destructive"}`}>
                  {amount >= 0 ? "+" : ""}
                  {amount}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
