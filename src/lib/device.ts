/**
 * Stable-ish device identifier used ONLY as a fraud signal.
 * The backend hashes it together with the IP and decides on suspension —
 * the client value is never trusted on its own.
 */
const KEY = "bf_device_id";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
  } catch {
    /* storage blocked */
  }
  const parts = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(new Date().getTimezoneOffset()),
    String((navigator as unknown as { hardwareConcurrency?: number }).hardwareConcurrency ?? 0),
  ].join("|");
  let hash = 0;
  for (let i = 0; i < parts.length; i += 1) {
    hash = (hash << 5) - hash + parts.charCodeAt(i);
    hash |= 0;
  }
  const id = `d${Math.abs(hash).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}
