import { FieldValue, HttpsError, col, db, nowMs } from "./init";

export interface AwardInput {
  uid: string;
  type: string;
  label: string;
  amount: number;
  idempotencyKey: string;
  note?: string;
  meta?: Record<string, unknown>;
}

/**
 * The single writer of balances. Append-only ledger + idempotency doc inside one
 * transaction, so a replayed call can never pay twice.
 */
export async function award(input: AwardInput): Promise<{ awarded: number; balance: number }> {
  const { uid, type, label, amount, idempotencyKey } = input;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) {
    throw new HttpsError("invalid-argument", "Invalid reward amount.");
  }
  const idemRef = col.idem(`${uid}_${idempotencyKey}`);
  const userRef = col.user(uid);

  return db.runTransaction(async (tx) => {
    const [idemSnap, userSnap] = await Promise.all([tx.get(idemRef), tx.get(userRef)]);
    if (idemSnap.exists) {
      const data = idemSnap.data() ?? {};
      return {
        awarded: (data["amount"] as number) ?? 0,
        balance: (data["balance"] as number) ?? 0,
      };
    }
    if (!userSnap.exists) throw new HttpsError("not-found", "Account not found.");
    const user = userSnap.data() ?? {};
    if (user["suspended"] === true) {
      throw new HttpsError("permission-denied", "Your account is suspended.");
    }

    const balance = ((user["balance"] as number) ?? 0) + amount;
    const totalEarned = ((user["totalEarned"] as number) ?? 0) + amount;

    tx.update(userRef, { balance, totalEarned, updatedAt: nowMs() });
    tx.set(col.ledger(uid).doc(), {
      type,
      label,
      amount,
      status: "completed",
      note: input.note ?? null,
      meta: input.meta ?? null,
      createdAt: nowMs(),
    });
    tx.set(idemRef, {
      uid,
      type,
      amount,
      balance,
      createdAt: nowMs(),
    });
    tx.set(
      col.stats(),
      { totalAwarded: FieldValue.increment(amount), updatedAt: nowMs() },
      { merge: true },
    );
    return { awarded: amount, balance };
  });
}

/** Debits (withdrawal hold, admin correction). Balance can never go negative. */
export async function debit(input: {
  uid: string;
  type: string;
  label: string;
  amount: number;
  idempotencyKey: string;
  note?: string;
  status?: string;
  meta?: Record<string, unknown>;
}): Promise<{ balance: number; ledgerId: string }> {
  const { uid, amount, idempotencyKey } = input;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpsError("invalid-argument", "Invalid amount.");
  }
  const idemRef = col.idem(`${uid}_${idempotencyKey}`);
  const userRef = col.user(uid);
  const ledgerRef = col.ledger(uid).doc();

  return db.runTransaction(async (tx) => {
    const [idemSnap, userSnap] = await Promise.all([tx.get(idemRef), tx.get(userRef)]);
    if (idemSnap.exists) {
      const data = idemSnap.data() ?? {};
      return {
        balance: (data["balance"] as number) ?? 0,
        ledgerId: (data["ledgerId"] as string) ?? ledgerRef.id,
      };
    }
    if (!userSnap.exists) throw new HttpsError("not-found", "Account not found.");
    const user = userSnap.data() ?? {};
    if (user["suspended"] === true) {
      throw new HttpsError("permission-denied", "Your account is suspended.");
    }
    const current = (user["balance"] as number) ?? 0;
    if (current < amount) throw new HttpsError("failed-precondition", "Not enough balance.");

    const balance = current - amount;
    tx.update(userRef, { balance, updatedAt: nowMs() });
    tx.set(ledgerRef, {
      type: input.type,
      label: input.label,
      amount: -amount,
      status: input.status ?? "completed",
      note: input.note ?? null,
      meta: input.meta ?? null,
      createdAt: nowMs(),
    });
    tx.set(idemRef, { uid, type: input.type, amount, balance, ledgerId: ledgerRef.id, createdAt: nowMs() });
    return { balance, ledgerId: ledgerRef.id };
  });
}

/** Recomputes the balance from the append-only ledger. Used by the integrity audit. */
export async function ledgerSum(uid: string) {
  let sum = 0;
  let last: string | null = null;
  for (;;) {
    let q = col.ledger(uid).orderBy("createdAt").limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data["status"] === "rejected") continue;
      sum += (data["amount"] as number) ?? 0;
      last = String(data["createdAt"]);
    }
    if (snap.size < 500) break;
  }
  return sum;
}
