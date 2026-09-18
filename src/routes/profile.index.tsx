import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Bell,
  ChevronRight,
  Globe,
  Info,
  Landmark,
  Megaphone,
  ReceiptText,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatTokens, formatUsd, shortAddress, tokensToUsd } from "@/lib/format";
import { openExternal } from "@/lib/telegram";
import { Card, GuideBox, SectionTitle } from "@/components/ui-kit";

export const Route = createFileRoute("/profile/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Profile — Bear Farm" },
      {
        name: "description",
        content: "Your Bear Farm profile: wallet, transactions, referrals, leaderboard and settings.",
      },
      { property: "og:title", content: "Profile — Bear Farm" },
      {
        property: "og:description",
        content: "Manage your wallet, withdrawals, preferences and account details.",
      },
    ],
  }),
  component: ProfilePage,
});

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "si", label: "සිංහල" },
  { code: "hi", label: "हिन्दी" },
  { code: "es", label: "Español" },
  { code: "ar", label: "العربية" },
];

function ProfilePage() {
  const { user, config } = useAuth();
  const [saving, setSaving] = useState(false);
  if (!user || !config) return null;

  const name =
    user.username ? `@${user.username}` : [user.firstName, user.lastName].filter(Boolean).join(" ");

  async function savePrefs(patch: { language?: string; notificationsEnabled?: boolean }) {
    setSaving(true);
    try {
      await api.updatePreferences(patch);
      toast.success("⚙️ Preferences saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <h1 className="font-display text-2xl font-extrabold">Profile</h1>
      </div>

      <Card className="mx-4 mt-3 flex items-center gap-3">
        {user.photoUrl ? (
          <img src={user.photoUrl} alt="" className="size-14 rounded-full object-cover" />
        ) : (
          <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-2xl">
            🐻
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-extrabold">{name || "Farmer"}</p>
          <p className="text-xs text-muted-foreground">Telegram ID: {user.telegramId}</p>
          <p className="text-xs text-muted-foreground">Wallet: {shortAddress(user.walletAddress)}</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-1 text-[10px] font-bold text-success">
          <ShieldCheck className="size-3" /> Active
        </span>
      </Card>

      <Card className="mx-4 mt-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            Balance
          </p>
          <p className="font-display text-2xl font-extrabold gold-text">
            {formatTokens(user.balance)} {config.tokenSymbol}
          </p>
        </div>
        <p className="font-display text-lg font-bold text-usdt">
          {formatUsd(tokensToUsd(user.balance, config.tokensPerUsd))}
        </p>
      </Card>

      <Group title="Finance">
        <RowLink to="/profile/wallet" icon={<Wallet className="size-5 text-usdt" />} label="Wallet" />
        <RowLink
          to="/profile/transactions"
          icon={<ReceiptText className="size-5 text-primary" />}
          label="Transactions"
        />
      </Group>

      <Group title="Social">
        <RowLink to="/refer" icon={<Users className="size-5 text-accent" />} label="Refer friends" />
        <RowLink
          to="/profile/leaderboard"
          icon={<Trophy className="size-5 text-primary" />}
          label="Leaderboard"
        />
        <RowLink
          to="/profile/payouts"
          icon={<Landmark className="size-5 text-usdt" />}
          label="Public payouts"
        />
      </Group>

      <Group title="Community">
        <RowButton
          icon={<Megaphone className="size-5 text-accent" />}
          label="Community channel"
          onClick={() => openExternal(config.communityChannelUrl)}
        />
        <RowButton
          icon={<Landmark className="size-5 text-usdt" />}
          label="Payment channel"
          onClick={() => openExternal(config.paymentChannelUrl)}
        />
      </Group>

      <Group title="Preferences">
        <div className="flex items-center gap-3 px-4 py-3">
          <Bell className="size-5 text-primary" />
          <span className="flex-1 font-display text-sm font-bold">Notifications</span>
          <button
            type="button"
            disabled={saving}
            onClick={() => savePrefs({ notificationsEnabled: !user.notificationsEnabled })}
            className={`h-7 w-12 rounded-full transition-colors ${
              user.notificationsEnabled ? "bg-accent" : "bg-muted"
            }`}
          >
            <span
              className={`block size-5 rounded-full bg-card transition-transform ${
                user.notificationsEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-3">
          <Globe className="size-5 text-accent" />
          <span className="flex-1 font-display text-sm font-bold">Language</span>
          <select
            value={user.language}
            disabled={saving}
            onChange={(e) => savePrefs({ language: e.target.value })}
            className="rounded-lg border border-input bg-input/50 px-2 py-1.5 text-sm outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <RowLink
          to="/profile/about"
          icon={<Info className="size-5 text-muted-foreground" />}
          label="About Bear Farm"
        />
      </Group>

      {user.isAdmin ? (
        <Group title="Admin">
          <RowLink
            to="/admin"
            icon={<ShieldCheck className="size-5 text-barn" />}
            label="Admin panel"
          />
        </Group>
      ) : null}

      <div className="mx-4 mt-4">
        <GuideBox
          title="Profile guide 👤"
          points={[
            "Your account is linked to your Telegram ID — it cannot be transferred.",
            "Set a USDT BEP-20 wallet before withdrawing. One address can only be used by one account.",
            `Conversion rate: ${config.tokensPerUsd.toLocaleString()} ${config.tokenSymbol} = $1.`,
            "Notifications control bot messages for mining, referrals and withdrawals.",
          ]}
        />
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 px-4">
      <SectionTitle title={title} />
      <div className="farm-card divide-y divide-border overflow-hidden !p-0">{children}</div>
    </section>
  );
}

function RowLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3">
      {icon}
      <span className="flex-1 font-display text-sm font-bold">{label}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </Link>
  );
}

function RowButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3">
      {icon}
      <span className="flex-1 text-left font-display text-sm font-bold">{label}</span>
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}
