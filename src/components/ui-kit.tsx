import type { ReactNode } from "react";
import { Info, Loader2 } from "lucide-react";
import { useState } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`farm-card p-4 ${className}`}>{children}</div>;
}

export function SectionTitle({
  icon,
  title,
  action,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-base font-extrabold">
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}

export function PopButton({
  children,
  onClick,
  disabled,
  loading,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "accent" | "muted" | "usdt" | "danger";
  className?: string;
}) {
  const styles: Record<string, string> = {
    primary: "bg-primary text-primary-foreground",
    accent: "bg-accent text-accent-foreground",
    muted: "bg-secondary text-secondary-foreground",
    usdt: "bg-usdt text-primary-foreground",
    danger: "bg-destructive text-destructive-foreground",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`btn-pop active:btn-pop-active inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-display text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

/** Collapsible guide shown on every tab. */
export function GuideBox({ title = "How this works", points }: { title?: string; points: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="farm-panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Info className="size-4 text-primary" />
        <span className="flex-1 font-display text-sm font-bold">{title}</span>
        <span className="text-xs text-muted-foreground">{open ? "Hide" : "Guide"}</span>
      </button>
      {open ? (
        <ul className="space-y-2 px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function StatPill({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "gold" | "green" | "usdt";
}) {
  const tones: Record<string, string> = {
    muted: "text-foreground",
    gold: "text-primary",
    green: "text-accent",
    usdt: "text-usdt",
  };
  return (
    <div className="farm-panel px-3 py-2 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display text-base font-extrabold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

export function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="py-8 text-center">
      <div className="text-3xl">{emoji}</div>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
