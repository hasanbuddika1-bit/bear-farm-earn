import { onCall } from "firebase-functions/v2/https";
import {
  FieldValue,
  HttpsError,
  col,
  db,
  enforceAppCheck,
  nowMs,
  rateLimit,
  requireActiveUser,
  requireAuth,
  requireIdempotencyKey,
  sanitizeString,
} from "./lib/init";
import { getConfig, withdrawalMath } from "./lib/config";
import { debit } from "./lib/ledger";

const BEP20 = /^0x[a-fA-F0-9]{40}$/;

/** One USDT address per account — the address index makes sharing impossible. */
export const setWallet = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "setWallet", 6, 60_000);
  const address = sanitizeString((req.data as Record<string, unknown>)?.["address"], 60);
  if (!BEP20.test(address)) {
    throw new HttpsError("invalid-argument", "Enter a valid BEP-20 (BSC) address.");
  }
  const key = address.toLowerCase();

  await db.runTransaction(async (tx) => {
    const walletRef = col.wallets().doc(key);
    const walletSnap = await tx.get(walletRef);
    if (walletSnap.exists && walletSnap.data()?.["uid"] !== uid) {
      throw new HttpsError("already-exists", "This address is already used by another account.");
    }
    const userSnap = await tx.get(col.user(uid));
    const pending = await tx.get(
      col.withdrawals().where("uid", "==", uid).where("status", "==", "pending").limit(1),
    );
    if (!pending.empty) {
      throw new HttpsError("failed-precondition", "You cannot change the wallet while a withdrawal is pending.");
    }
    const old = userSnap.data()?.["walletAddress"] as string | null;
    if (old && old.toLowerCase() !== key) {
      tx.delete(col.wallets().doc(old.toLowerCase()));
    }
    tx.set(walletRef, { uid, address, createdAt: nowMs() });
    tx.update(col.user(uid), { walletAddress: address, updatedAt: nowMs() });
  });

  return { ok: true as const };
});

/** Withdrawals are atomic: balance is held here, and only an admin can settle it. */
export const requestWithdrawal = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  const user = await requireActiveUser(uid);
  await rateLimit(uid, "requestWithdrawal", 5, 60_000);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const idempotencyKey = requireIdempotencyKey(data["idempotencyKey"]);
  const amountTokens = Math.floor(Number(data["amountTokens"]));
  if (!Number.isFinite(amountTokens) || amountTokens <= 0) {
    throw new HttpsError("invalid-argument", "Enter a valid amount.");
  }

  const config = await getConfig();
  if (config.maintenance) throw new HttpsError("unavailable", "Withdrawals are paused right now.");
  const address = user["walletAddress"] as string | null;
  if (!address) throw new HttpsError("failed-precondition", "Set your USDT BEP-20 wallet first.");

  const count = Number(user["withdrawalCount"] ?? 0);
  const minTokens = count === 0 ? config.firstWithdrawMinTokens : config.nextWithdrawMinTokens;
  if (amountTokens < minTokens) {
    throw new HttpsError("failed-precondition", `Minimum withdrawal is ${minTokens} tokens.`);
  }

  const pending = await col
    .withdrawals()
    .where("uid", "==", uid)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!pending.empty) {
    throw new HttpsError("failed-precondition", "You already have a pending withdrawal.");
  }

  const { feeUsd, netUsd } = withdrawalMath(amountTokens, config);
  if (netUsd <= 0) throw new HttpsError("failed-precondition", "Amount is too small after fees.");

  const { ledgerId } = await debit({
    uid,
    type: "withdrawal",
    label: "Withdrawal request",
    amount: amountTokens,
    idempotencyKey,
    status: "pending",
    meta: { address, feeUsd, netUsd },
  });

  const ref = col.withdrawals().doc();
  await ref.set({
    uid,
    telegramId: user["telegramId"],
    number: count + 1,
    amountTokens,
    feeUsd,
    netUsd,
    address,
    status: "pending",
    ledgerId,
    createdAt: nowMs(),
  });
  await col.user(uid).set({ withdrawalCount: FieldValue.increment(1) }, { merge: true });
  await col
    .stats()
    .set({ pendingUsd: FieldValue.increment(netUsd), updatedAt: nowMs() }, { merge: true });

  return { id: ref.id, netUsd };
});

export const listWithdrawals = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  const cursor = (req.data as Record<string, unknown>)?.["cursor"];
  let q = col.withdrawals().where("uid", "==", uid).orderBy("createdAt", "desc").limit(20);
  if (typeof cursor === "string" && cursor) q = q.startAfter(Number(cursor));
  const snap = await q.get();
  const rows = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      number: Number(d["number"] ?? 0),
      amountTokens: Number(d["amountTokens"] ?? 0),
      feeUsd: Number(d["feeUsd"] ?? 0),
      netUsd: Number(d["netUsd"] ?? 0),
      address: (d["address"] as string) ?? "",
      status: (d["status"] as string) ?? "pending",
      txId: (d["txId"] as string) ?? null,
      createdAt: Number(d["createdAt"] ?? 0),
      reviewedAt: Number(d["reviewedAt"] ?? 0) || null,
      rejectReason: (d["rejectReason"] as string) ?? null,
    };
  });
  const last = snap.docs.at(-1);
  return { rows, nextCursor: snap.size === 20 && last ? String(last.data()["createdAt"]) : null };
});

export const listLedger = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  const cursor = (req.data as Record<string, unknown>)?.["cursor"];
  let q = col.ledger(uid).orderBy("createdAt", "desc").limit(25);
  if (typeof cursor === "string" && cursor) q = q.startAfter(Number(cursor));
  const snap = await q.get();
  const rows = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      type: (d["type"] as string) ?? "reward",
      label: (d["label"] as string) ?? "Reward",
      amount: Number(d["amount"] ?? 0),
      status: (d["status"] as string) ?? "completed",
      note: (d["note"] as string) ?? undefined,
      createdAt: Number(d["createdAt"] ?? 0),
    };
  });
  const last = snap.docs.at(-1);
  return { rows, nextCursor: snap.size === 25 && last ? String(last.data()["createdAt"]) : null };
});

export const updatePreferences = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireActiveUser(uid);
  await rateLimit(uid, "updatePreferences", 20, 60_000);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = { updatedAt: nowMs() };
  if (typeof data["language"] === "string") {
    const lang = data["language"].slice(0, 5);
    if (!["en", "si", "ta", "hi", "ru"].includes(lang)) {
      throw new HttpsError("invalid-argument", "Unsupported language.");
    }
    update["language"] = lang;
  }
  if (typeof data["notificationsEnabled"] === "boolean") {
    update["notificationsEnabled"] = data["notificationsEnabled"];
  }
  await col.user(uid).set(update, { merge: true });
  return { ok: true as const };
});
