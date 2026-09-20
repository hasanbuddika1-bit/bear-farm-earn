import { createHash, timingSafeEqual } from "crypto";
import { onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  ADMIN_PASSWORD,
  ADMIN_TELEGRAM_ID,
  ADMIN_USERNAME,
  FieldValue,
  HttpsError,
  TELEGRAM_BOT_TOKEN,
  col,
  db,
  enforceAppCheck,
  nowMs,
  rateLimit,
  requireAuth,
  sanitizeString,
} from "./lib/init";
import { CONFIG_BOUNDS, DEFAULT_CONFIG, getConfig } from "./lib/config";
import { award, ledgerSum } from "./lib/ledger";
import { miniAppButton, sendMessage } from "./lib/telegram";

const SESSION_MS = 2 * 60 * 60 * 1000;

function sameSecret(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Admin identity = the configured Telegram id AND the password pair. Both are server side. */
async function requireAdminSession(uid: string) {
  const snap = await col.user(uid).get();
  const telegramId = Number(snap.data()?.["telegramId"] ?? 0);
  if (!snap.exists || telegramId !== Number(ADMIN_TELEGRAM_ID.value())) {
    throw new HttpsError("permission-denied", "Admins only.");
  }
  const session = await col.adminSessions().doc(uid).get();
  if (!session.exists || Number(session.data()?.["expiresAt"] ?? 0) < nowMs()) {
    throw new HttpsError("unauthenticated", "Admin session expired. Log in again.");
  }
  return telegramId;
}

async function audit(uid: string, action: string, detail: Record<string, unknown>) {
  await col.audit().add({ uid, action, detail, createdAt: nowMs() });
}

export const adminLogin = onCall(
  { secrets: [ADMIN_USERNAME, ADMIN_PASSWORD], enforceAppCheck, cors: true },
  async (req) => {
    const uid = requireAuth(req);
    await rateLimit(uid, "adminLogin", 5, 300_000);
    const data = (req.data ?? {}) as Record<string, unknown>;
    const username = sanitizeString(data["username"], 60);
    const password = sanitizeString(data["password"], 120);

    const snap = await col.user(uid).get();
    if (Number(snap.data()?.["telegramId"] ?? 0) !== Number(ADMIN_TELEGRAM_ID.value())) {
      throw new HttpsError("permission-denied", "Admins only.");
    }
    if (!sameSecret(username, ADMIN_USERNAME.value()) || !sameSecret(password, ADMIN_PASSWORD.value())) {
      await audit(uid, "adminLoginFailed", {});
      throw new HttpsError("permission-denied", "Wrong username or password.");
    }
    const expiresAt = nowMs() + SESSION_MS;
    await col.adminSessions().doc(uid).set({ expiresAt, createdAt: nowMs() });
    await col.user(uid).set({ isAdmin: true }, { merge: true });
    await audit(uid, "adminLogin", {});
    return { ok: true as const, expiresAt };
  },
);

export const adminList = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = requireAuth(req);
  await requireAdminSession(uid);
  const data = (req.data ?? {}) as Record<string, unknown>;
  const resource = sanitizeString(data["resource"], 30);
  const cursor = typeof data["cursor"] === "string" ? data["cursor"] : null;
  const query = typeof data["query"] === "string" ? data["query"].trim() : "";

  const page = <T>(rows: T[], nextCursor: string | null) => ({ rows, nextCursor });

  if (resource === "overview") {
    const [stats, users, pending] = await Promise.all([
      col.stats().get(),
      col.users().count().get(),
      col.withdrawals().where("status", "==", "pending").count().get(),
    ]);
    return {
      rows: [],
      nextCursor: null,
      stats: {
        users: users.data().count,
        pendingWithdrawals: pending.data().count,
        totalAwarded: Number(stats.data()?.["totalAwarded"] ?? 0),
        totalPaidUsd: Number(stats.data()?.["totalPaidUsd"] ?? 0),
      },
    };
  }

  if (resource === "users") {
    let q = col.users().orderBy("createdAt", "desc").limit(20);
    if (query) {
      const numeric = Number(query);
      q = Number.isInteger(numeric)
        ? (col.users().where("telegramId", "==", numeric).limit(20) as never)
        : (col.users().where("username", "==", query.replace(/^@/, "")).limit(20) as never);
    } else if (cursor) {
      q = q.startAfter(Number(cursor));
    }
    const snap = await q.get();
    const rows = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        telegramId: d["telegramId"],
        balance: Number(d["balance"] ?? 0),
        totalEarned: Number(d["totalEarned"] ?? 0),
        suspended: d["suspended"] === true,
        suspendedReason: d["suspendedReason"] ?? null,
        referralCount: Number(d["referralCount"] ?? 0),
        createdAt: Number(d["createdAt"] ?? 0),
      };
    });
    const last = snap.docs.at(-1);
    return page(rows, snap.size === 20 && last ? String(last.data()["createdAt"]) : null);
  }

  if (resource === "withdrawals") {
    let q = col.withdrawals().orderBy("createdAt", "desc").limit(20);
    if (query) q = col.withdrawals().where("status", "==", query).orderBy("createdAt", "desc").limit(20);
    else if (cursor) q = q.startAfter(Number(cursor));
    const snap = await q.get();
    const rows = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        telegramId: d["telegramId"],
        amountTokens: Number(d["amountTokens"] ?? 0),
        feeUsd: Number(d["feeUsd"] ?? 0),
        netUsd: Number(d["netUsd"] ?? 0),
        address: d["address"],
        status: d["status"],
        txId: d["txId"] ?? null,
        createdAt: Number(d["createdAt"] ?? 0),
      };
    });
    const last = snap.docs.at(-1);
    return page(rows, snap.size === 20 && last ? String(last.data()["createdAt"]) : null);
  }

  if (resource === "tasks") {
    const snap = await col.tasks().orderBy("createdAt", "desc").limit(100).get();
    return page(
      snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      null,
    );
  }

  if (resource === "codes") {
    const snap = await col.codes().orderBy("createdAt", "desc").limit(100).get();
    return page(
      snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      null,
    );
  }

  if (resource === "config") {
    const config = await getConfig();
    return page([config as unknown as Record<string, unknown>], null);
  }

  if (resource === "audit") {
    let q = col.audit().orderBy("createdAt", "desc").limit(30);
    if (cursor) q = q.startAfter(Number(cursor));
    const snap = await q.get();
    const last = snap.docs.at(-1);
    return page(
      snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      snap.size === 30 && last ? String(last.data()["createdAt"]) : null,
    );
  }

  throw new HttpsError("invalid-argument", "Unknown resource.");
});

export const adminAction = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN], enforceAppCheck, cors: true },
  async (req) => {
    const uid = requireAuth(req);
    await requireAdminSession(uid);
    const data = (req.data ?? {}) as Record<string, unknown>;
    const action = sanitizeString(data["action"], 40);
    const payload = (data["payload"] ?? {}) as Record<string, unknown>;
    const config = await getConfig();
    const botToken = TELEGRAM_BOT_TOKEN.value();

    const targetUid = () => sanitizeString(payload["uid"], 60);

    switch (action) {
      case "suspendUser": {
        const target = targetUid();
        const reason = typeof payload["reason"] === "string" ? payload["reason"].slice(0, 200) : "Policy violation";
        await col.user(target).set({ suspended: true, suspendedReason: reason }, { merge: true });
        await audit(uid, action, { target, reason });
        return { ok: true as const, message: "User suspended" };
      }
      case "unsuspendUser": {
        const target = targetUid();
        await col.user(target).set({ suspended: false, suspendedReason: null }, { merge: true });
        await audit(uid, action, { target });
        return { ok: true as const, message: "User restored" };
      }
      case "adjustBalance": {
        const target = targetUid();
        const amount = Math.floor(Number(payload["amount"]));
        if (!Number.isFinite(amount) || amount === 0) {
          throw new HttpsError("invalid-argument", "Enter a non-zero amount.");
        }
        const key = `admin_${nowMs()}`;
        if (amount > 0) {
          await award({ uid: target, type: "admin", label: "Admin adjustment", amount, idempotencyKey: key });
        } else {
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(col.user(target));
            const balance = Math.max(0, Number(snap.data()?.["balance"] ?? 0) + amount);
            tx.update(col.user(target), { balance, updatedAt: nowMs() });
            tx.set(col.ledger(target).doc(), {
              type: "admin",
              label: "Admin adjustment",
              amount,
              status: "completed",
              createdAt: nowMs(),
            });
          });
        }
        await audit(uid, action, { target, amount });
        return { ok: true as const, message: "Balance updated" };
      }
      case "approveWithdrawal": {
        const id = sanitizeString(payload["id"], 60);
        const txId = sanitizeString(payload["txId"], 120);
        const info = await db.runTransaction(async (tx) => {
          const ref = col.withdrawals().doc(id);
          const snap = await tx.get(ref);
          if (!snap.exists) throw new HttpsError("not-found", "Withdrawal not found.");
          const d = snap.data()!;
          if (d["status"] !== "pending") throw new HttpsError("failed-precondition", "Already reviewed.");
          tx.update(ref, { status: "approved", txId, reviewedAt: nowMs(), reviewedBy: uid });
          tx.update(col.ledger(d["uid"] as string).doc(d["ledgerId"] as string), {
            status: "completed",
            note: `TX ${txId}`,
          });
          tx.set(
            col.stats(),
            {
              totalPaidUsd: FieldValue.increment(Number(d["netUsd"] ?? 0)),
              pendingUsd: FieldValue.increment(-Number(d["netUsd"] ?? 0)),
            },
            { merge: true },
          );
          return d;
        });
        await sendMessage(
          botToken,
          info["telegramId"] as number,
          `💵 <b>Withdrawal paid!</b>\n\n🪙 ${info["amountTokens"]} ${config.tokenSymbol}\n💰 $${info["netUsd"]} USDT (BEP-20)\n🔗 TX: <code>${txId}</code>`,
          miniAppButton(config.botUsername),
        );
        await sendMessage(
          botToken,
          config.paymentChatId,
          `✅ <b>Payout sent</b>\n\n💰 $${info["netUsd"]} USDT (BEP-20)\n🔗 <code>${txId}</code>\n🐻 Bear Farm pays every farmer.`,
          miniAppButton(config.botUsername),
        );
        await audit(uid, action, { id, txId });
        return { ok: true as const, message: "Withdrawal approved" };
      }
      case "rejectWithdrawal": {
        const id = sanitizeString(payload["id"], 60);
        const reason = typeof payload["reason"] === "string" ? payload["reason"].slice(0, 200) : "Rejected";
        const info = await db.runTransaction(async (tx) => {
          const ref = col.withdrawals().doc(id);
          const snap = await tx.get(ref);
          if (!snap.exists) throw new HttpsError("not-found", "Withdrawal not found.");
          const d = snap.data()!;
          if (d["status"] !== "pending") throw new HttpsError("failed-precondition", "Already reviewed.");
          const targetRef = col.user(d["uid"] as string);
          const target = await tx.get(targetRef);
          tx.update(ref, { status: "rejected", rejectReason: reason, reviewedAt: nowMs(), reviewedBy: uid });
          tx.update(col.ledger(d["uid"] as string).doc(d["ledgerId"] as string), {
            status: "rejected",
            note: reason,
          });
          // Refund the held amount.
          tx.update(targetRef, {
            balance: Number(target.data()?.["balance"] ?? 0) + Number(d["amountTokens"] ?? 0),
            updatedAt: nowMs(),
          });
          tx.set(col.ledger(d["uid"] as string).doc(), {
            type: "refund",
            label: "Withdrawal refund",
            amount: Number(d["amountTokens"] ?? 0),
            status: "completed",
            note: reason,
            createdAt: nowMs(),
          });
          tx.set(
            col.stats(),
            { pendingUsd: FieldValue.increment(-Number(d["netUsd"] ?? 0)) },
            { merge: true },
          );
          return d;
        });
        await sendMessage(
          botToken,
          info["telegramId"] as number,
          `⚠️ <b>Withdrawal rejected</b>\n\n📝 ${reason}\n🪙 ${info["amountTokens"]} ${config.tokenSymbol} went back to your balance.`,
          miniAppButton(config.botUsername),
        );
        await audit(uid, action, { id, reason });
        return { ok: true as const, message: "Withdrawal rejected" };
      }
      case "createTask":
      case "updateTask": {
        const id = typeof payload["id"] === "string" && payload["id"] ? payload["id"] : col.tasks().doc().id;
        const reward = Math.floor(Number(payload["reward"] ?? 0));
        if (reward < 0 || reward > 1_000_000) throw new HttpsError("invalid-argument", "Invalid reward.");
        await col.tasks().doc(id).set(
          {
            group: payload["group"] === "partner" ? "partner" : "main",
            kind: ["telegram_channel", "mini_app", "link"].includes(String(payload["kind"]))
              ? payload["kind"]
              : "link",
            title: sanitizeString(payload["title"], 120),
            description: typeof payload["description"] === "string" ? payload["description"].slice(0, 300) : "",
            url: sanitizeString(payload["url"], 300),
            chatId: typeof payload["chatId"] === "string" ? payload["chatId"].slice(0, 80) : null,
            reward,
            active: payload["active"] !== false,
            createdAt: nowMs(),
          },
          { merge: true },
        );
        await audit(uid, action, { id });
        return { ok: true as const, message: "Task saved" };
      }
      case "deleteTask": {
        const id = sanitizeString(payload["id"], 60);
        await col.tasks().doc(id).delete();
        await audit(uid, action, { id });
        return { ok: true as const, message: "Task removed" };
      }
      case "createCode": {
        const code = sanitizeString(payload["code"], 40).toUpperCase();
        const reward = Math.floor(Number(payload["reward"] ?? 0));
        if (reward <= 0 || reward > 1_000_000) throw new HttpsError("invalid-argument", "Invalid reward.");
        await col.codes().doc(code).set({
          reward,
          maxUses: Math.max(0, Math.floor(Number(payload["maxUses"] ?? 0))),
          usedCount: 0,
          expiresAt: Number(payload["expiresAt"] ?? 0) || 0,
          active: true,
          createdAt: nowMs(),
        });
        await audit(uid, action, { code, reward });
        return { ok: true as const, message: "Code created" };
      }
      case "disableCode": {
        const code = sanitizeString(payload["code"], 40).toUpperCase();
        await col.codes().doc(code).set({ active: false }, { merge: true });
        await audit(uid, action, { code });
        return { ok: true as const, message: "Code disabled" };
      }
      case "updateConfig": {
        const update: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(payload)) {
          if (!(key in DEFAULT_CONFIG)) continue;
          const bounds = CONFIG_BOUNDS[key];
          if (bounds) {
            const num = Number(value);
            if (!Number.isFinite(num) || num < bounds[0] || num > bounds[1]) {
              throw new HttpsError("invalid-argument", `${key} is out of range.`);
            }
            update[key] = num;
            continue;
          }
          if (typeof value === "boolean" || typeof value === "string" || Array.isArray(value)) {
            update[key] = value;
          }
        }
        await col.config().set(update, { merge: true });
        await audit(uid, action, update);
        return { ok: true as const, message: "Config updated" };
      }
      default:
        throw new HttpsError("invalid-argument", "Unknown action.");
    }
  },
);

/**
 * Integrity audit: if a balance ever disagrees with the append-only ledger the
 * account is suspended automatically and the admin is notified.
 */
export const balanceAudit = onSchedule(
  { schedule: "every 60 minutes", secrets: [TELEGRAM_BOT_TOKEN], timeoutSeconds: 540 },
  async () => {
    const snap = await col.users().orderBy("updatedAt", "desc").limit(200).get();
    for (const doc of snap.docs) {
      const balance = Number(doc.data()["balance"] ?? 0);
      const expected = await ledgerSum(doc.id);
      if (Math.abs(expected - balance) < 1) continue;
      await doc.ref.set(
        {
          suspended: true,
          suspendedReason: "Balance mismatch detected by the integrity audit.",
        },
        { merge: true },
      );
      await col.audit().add({
        uid: "system",
        action: "autoSuspendBalanceMismatch",
        detail: { target: doc.id, balance, expected },
        createdAt: nowMs(),
      });
      await sendMessage(
        TELEGRAM_BOT_TOKEN.value(),
        Number(ADMIN_TELEGRAM_ID.value()),
        `🚨 <b>Balance mismatch</b>\n👤 <code>${doc.data()["telegramId"]}</code>\n💾 stored: ${balance}\n📒 ledger: ${expected}\n⛔ Account auto-suspended.`,
      );
    }
  },
);
