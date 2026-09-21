const SESSION_KEY = "bf_session";
const ADMIN_KEY = "bf_admin_session";

let sessionToken: string | null = null;
let adminToken: string | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getSessionToken(): string {
  if (sessionToken) return sessionToken;
  sessionToken = storage()?.getItem(SESSION_KEY) ?? null;
  return sessionToken ?? "";
}

export function setSessionToken(token: string) {
  sessionToken = token;
  storage()?.setItem(SESSION_KEY, token);
}

export function clearSessionToken() {
  sessionToken = null;
  storage()?.removeItem(SESSION_KEY);
}

export function getAdminToken(): string {
  if (adminToken) return adminToken;
  adminToken = storage()?.getItem(ADMIN_KEY) ?? null;
  return adminToken ?? "";
}

export function setAdminToken(token: string) {
  adminToken = token;
  storage()?.setItem(ADMIN_KEY, token);
}

export function clearAdminToken() {
  adminToken = null;
  storage()?.removeItem(ADMIN_KEY);
}

/** Lets the auth provider refresh the balance right after any earning action. */
const listeners = new Set<() => void>();

export function onBalanceChanged(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyBalanceChanged() {
  for (const listener of listeners) listener();
}
