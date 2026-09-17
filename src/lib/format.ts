export function formatTokens(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function formatUsd(value: number | null | undefined, digits = 4): string {
  const n = Number(value ?? 0);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

export function tokensToUsd(tokens: number, tokensPerUsd: number): number {
  if (!tokensPerUsd) return 0;
  return tokens / tokensPerUsd;
}

export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function formatDate(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortAddress(address: string | null | undefined): string {
  if (!address) return "Not set";
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

/** Next 00:00:00 UTC reset in ms. */
export function msUntilUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0, 0);
  return next - now;
}

export function utcDayKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}
