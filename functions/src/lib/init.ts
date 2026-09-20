import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";

initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth();
export { FieldValue, Timestamp, HttpsError };

/** Server secrets — never present in the client bundle. */
export const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
export const ADMIN_USERNAME = defineSecret("ADMIN_USERNAME");
export const ADMIN_PASSWORD = defineSecret("ADMIN_PASSWORD");
export const ADS_CALLBACK_SECRET = defineSecret("ADS_CALLBACK_SECRET");
export const TELEGRAM_WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");
export const ADMIN_TELEGRAM_ID = defineString("ADMIN_TELEGRAM_ID", { default: "5419054691" });

/** App Check is enforced unless explicitly disabled for local emulation. */
export const enforceAppCheck = process.env["ENFORCE_APP_CHECK"] !== "false";

export const col = {
  users: () => db.collection("users"),
  user: (uid: string) => db.collection("users").doc(uid),
  ledger: (uid: string) => db.collection("users").doc(uid).collection("ledger"),
  idem: (key: string) => db.collection("idempotency").doc(key),
  tasks: () => db.collection("tasks"),
  taskClaims: (uid: string) => db.collection("users").doc(uid).collection("taskClaims"),
  taskSessions: () => db.collection("taskSessions"),
  codes: () => db.collection("rewardCodes"),
  withdrawals: () => db.collection("withdrawals"),
  referrals: () => db.collection("referrals"),
  devices: () => db.collection("devices"),
  wallets: () => db.collection("wallets"),
  adViews: () => db.collection("adViews"),
  audit: () => db.collection("auditLog"),
  adminSessions: () => db.collection("adminSessions"),
  rate: () => db.collection("rateLimits"),
  config: () => db.collection("meta").doc("config"),
  stats: () => db.collection("meta").doc("stats"),
};

export function nowMs() {
  return Date.now();
}

/** Every authenticated callable goes through this — no request is trusted. */
export function requireAuth(req: CallableRequest<unknown>): string {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in through Telegram first.");
  return uid;
}

export async function requireActiveUser(uid: string) {
  const snap = await col.user(uid).get();
  if (!snap.exists) throw new HttpsError("not-found", "Account not found.");
  const user = snap.data() as Record<string, unknown>;
  if (user["suspended"] === true) {
    throw new HttpsError("permission-denied", "Your account is suspended.");
  }
  return user;
}

/** Fixed-window rate limit, stored server side. */
export async function rateLimit(uid: string, action: string, limit: number, windowMs: number) {
  const bucket = Math.floor(nowMs() / windowMs);
  const ref = col.rate().doc(`${uid}_${action}_${bucket}`);
  const count = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? ((snap.data()?.["count"] as number) ?? 0) : 0;
    if (current >= limit) return current + 1;
    tx.set(ref, { count: current + 1, expiresAt: (bucket + 2) * windowMs }, { merge: true });
    return current + 1;
  });
  if (count > limit) throw new HttpsError("resource-exhausted", "Too many attempts. Slow down.");
}

export function sanitizeString(value: unknown, max = 200): string {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", "Invalid text value.");
  const trimmed = value.trim().slice(0, max);
  if (!trimmed) throw new HttpsError("invalid-argument", "Value cannot be empty.");
  return trimmed;
}

export function requireIdempotencyKey(value: unknown): string {
  const key = sanitizeString(value, 80);
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new HttpsError("invalid-argument", "Invalid idempotency key.");
  }
  return key;
}

export function publicName(user: { username?: unknown; firstName?: unknown; telegramId?: unknown }) {
  const username = typeof user.username === "string" ? user.username : null;
  if (username) return `@${username}`;
  const first = typeof user.firstName === "string" ? user.firstName : null;
  if (first) return first.slice(0, 12);
  const id = String(user.telegramId ?? "");
  return id ? `Farmer ${id.slice(-4)}` : "Farmer";
}
