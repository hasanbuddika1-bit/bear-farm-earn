import { db } from "./db.server";

const enc = new TextEncoder();

function sessionSecret() {
  const secret = process.env["BEARFARM_SESSION_SECRET"];
  if (!secret) throw new Error("Session secret is not configured.");
  return secret;
}

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

export interface SessionClaims {
  uid: string;
  tg: string;
  exp: number;
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export async function issueSession(uid: string, telegramId: string): Promise<string> {
  const claims: SessionClaims = { uid, tg: telegramId, exp: Date.now() + SESSION_TTL_MS };
  const body = b64url(enc.encode(JSON.stringify(claims)));
  return `${body}.${await sign(body)}`;
}

export async function readSession(token: string | null | undefined): Promise<SessionClaims> {
  if (!token || token.length > 2048) throw new Error("Please reopen the mini app to sign in.");
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new Error("Please reopen the mini app to sign in.");
  const expected = await sign(body);
  if (expected.length !== sig.length) throw new Error("Session is not valid.");
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error("Session is not valid.");
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionClaims;
  if (!claims?.uid || claims.exp < Date.now()) throw new Error("Session expired. Reopen the app.");
  return claims;
}

/** Simple per-user, per-action window limiter stored in the database. */
export async function rateLimit(bucketKey: string, limit: number, windowSeconds: number) {
  const client = db();
  const now = Date.now();
  const { data } = await client
    .from("rate_limits")
    .select("count, window_at")
    .eq("bucket", bucketKey)
    .maybeSingle();

  const windowStart = data?.window_at ? Date.parse(data.window_at as string) : 0;
  const fresh = now - windowStart < windowSeconds * 1000;
  const count = fresh ? Number(data?.count ?? 0) : 0;
  if (count >= limit) throw new Error("Too many attempts. Please wait a moment.");

  await client.from("rate_limits").upsert({
    bucket: bucketKey,
    count: count + 1,
    window_at: fresh ? new Date(windowStart).toISOString() : new Date(now).toISOString(),
  });
}

export function sanitizeString(value: unknown, maxLength = 200): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, maxLength);
}
