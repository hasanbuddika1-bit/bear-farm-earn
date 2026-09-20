import { onCall } from "firebase-functions/v2/https";
import { col, enforceAppCheck, publicName, requireAuth } from "./lib/init";

/** Public leaderboard — names only, never Telegram ids or wallets. */
export const publicLeaderboard = onCall({ enforceAppCheck, cors: true }, async (req) => {
  const uid = req.auth?.uid ?? null;
  const snap = await col
    .users()
    .where("suspended", "==", false)
    .orderBy("totalEarned", "desc")
    .limit(50)
    .get();

  const rows = snap.docs.map((doc) => ({
    name: publicName(doc.data() as never),
    earned: Number(doc.data()["totalEarned"] ?? 0),
    isMe: doc.id === uid,
  }));

  let myRank: number | null = null;
  const index = snap.docs.findIndex((doc) => doc.id === uid);
  if (index >= 0) myRank = index + 1;
  else if (uid) {
    const me = await col.user(uid).get();
    if (me.exists) {
      const better = await col
        .users()
        .where("suspended", "==", false)
        .where("totalEarned", ">", Number(me.data()?.["totalEarned"] ?? 0))
        .count()
        .get();
      myRank = better.data().count + 1;
    }
  }

  return { rows, myRank };
});

/** Public payout feed — first names only, plus totals. */
export const publicPayouts = onCall({ enforceAppCheck, cors: true }, async (req) => {
  void requireAuth;
  const [approved, pending, statsSnap] = await Promise.all([
    col.withdrawals().where("status", "==", "approved").orderBy("reviewedAt", "desc").limit(25).get(),
    col.withdrawals().where("status", "==", "pending").limit(200).get(),
    col.stats().get(),
  ]);

  const recent = await Promise.all(
    approved.docs.map(async (doc) => {
      const d = doc.data();
      const user = await col.user(d["uid"] as string).get();
      return {
        name: publicName((user.data() ?? {}) as never),
        netUsd: Number(d["netUsd"] ?? 0),
        paidAt: Number(d["reviewedAt"] ?? d["createdAt"] ?? 0),
      };
    }),
  );

  const totalPaidUsd = Number(statsSnap.data()?.["totalPaidUsd"] ?? 0);
  const pendingUsd = pending.docs.reduce((sum, doc) => sum + Number(doc.data()["netUsd"] ?? 0), 0);
  void req;
  return { recent, totalPaidUsd, pendingUsd };
});
