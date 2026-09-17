import { RefreshCw, WifiOff, ShieldAlert, Send, Wrench } from "lucide-react";
import logo from "@/assets/bear-farm-logo.png.asset.json";
import type { AuthErrorInfo, AuthStatus } from "@/lib/auth-context";

const STAGE_TEXT: Record<string, string> = {
  booting: "Waking up the farm…",
  connecting: "Verifying your Telegram account…",
  syncing: "Loading your barn…",
};

export function LoadingScreen({
  status,
  error,
  onRetry,
}: {
  status: AuthStatus;
  error: AuthErrorInfo | null;
  onRetry: () => void;
}) {
  const isError = Boolean(error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10 text-center">
      <div className="relative">
        <span className="absolute inset-0 rounded-full bg-primary/25 animate-pulse-ring" />
        <img
          src={logo.url}
          alt="Bear Farm"
          className={`relative size-40 drop-shadow-2xl ${isError ? "opacity-60 grayscale" : "animate-float"}`}
        />
      </div>

      <h1 className="mt-6 font-display text-3xl font-extrabold gold-text">Bear Farm</h1>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
        Earn · Grow · Withdraw
      </p>

      {!isError ? (
        <>
          <div className="mt-8 h-2 w-56 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 rounded-full bg-primary animate-shine" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{STAGE_TEXT[status] ?? "Loading…"}</p>
        </>
      ) : (
        <div className="mt-8 w-full max-w-sm farm-card p-5">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            {error?.kind === "network" ? (
              <WifiOff className="size-6" />
            ) : error?.kind === "telegram" ? (
              <Send className="size-6" />
            ) : error?.kind === "config" ? (
              <Wrench className="size-6" />
            ) : (
              <ShieldAlert className="size-6" />
            )}
          </div>
          <h2 className="mt-3 font-display text-lg font-bold">{error?.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{error?.message}</p>

          {error?.kind === "telegram" ? (
            <a
              href="https://t.me/Bear_Farmbot/earn"
              className="btn-pop active:btn-pop-active mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground"
            >
              <Send className="size-4" /> Open in Telegram
            </a>
          ) : error?.kind !== "config" ? (
            <button
              onClick={onRetry}
              className="btn-pop active:btn-pop-active mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground"
            >
              <RefreshCw className="size-4" /> Try again
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function SuspendedScreen({ reason }: { reason?: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <ShieldAlert className="size-10" />
      </div>
      <h1 className="mt-5 font-display text-2xl font-extrabold">Account suspended 🚫</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {reason ??
          "Our anti-fraud system flagged unusual activity on this account. All farm actions are disabled."}
      </p>
      <a
        href="https://t.me/bearfarmCommunity"
        className="btn-pop active:btn-pop-active mt-6 rounded-xl bg-secondary px-5 py-3 font-display font-bold text-secondary-foreground"
      >
        Contact community support
      </a>
    </div>
  );
}
