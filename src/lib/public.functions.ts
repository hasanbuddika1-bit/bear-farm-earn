import { createServerFn } from "@tanstack/react-start";

export interface LeaderboardRow {
  rank: number;
  name: string;
  balance: number;
  isMe?: boolean;
}

export interface PayoutRow {
  name: string;
  netUsd: number;
  paidAt: number;
  /** On-chain BEP-20 transaction hash, verifiable on BscScan. */
  txId: string | null;
  /** Shortened receiving wallet (0x1234…abcd) — matches the on-chain transfer. */
  wallet: string;
}

function shortWallet(addr: string | null | undefined) {
  const a = String(addr ?? "");
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/** Public top-100. Only display names and balances are exposed by the view. */
export const publicLeaderboard = createServerFn({ method: "POST" })
  .inputValidator((input: { token?: string | null }) => ({
    token: input?.token ? String(input.token) : null,
  }))
  .handler(async ({ data }): Promise<{ rows: LeaderboardRow[]; myRank: number | null }> => {
    const { db } = await import("./server/db.server");
    const client = db();
    const { data: rows } = await client
      .from("public_leaderboard")
      .select("rank, name, balance")
      .limit(100);

    let myRank: number | null = null;
    let myName: string | null = null;
    if (data.token) {
      try {
        const { requireUser } = await import("./server/user.server");
        const { row } = await requireUser(data.token, { allowSuspended: true });
        myName = (row.first_name || row.username || "Farmer").slice(0, 24);
        const { count } = await client
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("suspended", false)
          .gt("balance", Number(row.balance));
        myRank = (count ?? 0) + 1;
      } catch {
        myRank = null;
      }
    }

    return {
      rows: (rows ?? []).map((r) => ({
        rank: Number(r.rank),
        name: (r.name as string) ?? "Farmer",
        balance: Number(r.balance),
        isMe: myName !== null && myRank !== null && Number(r.rank) === myRank,
      })),
      myRank,
    };
  });

/** Public payout wall — names and amounts only, no wallet addresses. */
export const publicPayouts = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ recent: PayoutRow[]; totalPaidUsd: number; pendingCount: number }> => {
    const { db } = await import("./server/db.server");
    const client = db();
    const [{ data: rows }, { data: stats }, { count: pending }] = await Promise.all([
      client.from("public_payouts").select("name, net_usd, paid_at").limit(50),
      client.from("stats").select("paid_usd").eq("id", "global").maybeSingle(),
      client
        .from("withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

    const recent: PayoutRow[] = (rows ?? []).map((r) => ({
      name: (r.name as string) ?? "Farmer",
      netUsd: Number(r.net_usd),
      paidAt: Date.parse(r.paid_at as string),
    }));
    const fromStats = Number(stats?.paid_usd ?? 0);
    const totalPaidUsd =
      fromStats > 0 ? fromStats : recent.reduce((sum, r) => sum + r.netUsd, 0);

    return {
      recent,
      totalPaidUsd: Math.round(totalPaidUsd * 10000) / 10000,
      pendingCount: pending ?? 0,
    };
  },
);

export interface ReferralLeaderRow {
  rank: number;
  name: string;
  active: number;
  total: number;
  isMe: boolean;
}

/** Public referral ranking — names and friend counts only. Fake friends never count. */
export const referralLeaderboard = createServerFn({ method: "POST" })
  .inputValidator((input: { token?: string | null }) => ({
    token: input?.token ? String(input.token) : null,
  }))
  .handler(async ({ data }): Promise<{ rows: ReferralLeaderRow[]; myRank: number | null }> => {
    const { db } = await import("./server/db.server");
    const { rankReferrers } = await import("./referral-rules");
    const client = db();
    const { data: refs } = await client
      .from("referrals")
      .select("referrer_id, stage")
      .neq("stage", "fake")
      .limit(20000);

    const ranked = rankReferrers(
      (refs ?? []).map((r) => ({
        referrerId: r.referrer_id as string,
        stage: r.stage as "pending" | "half" | "verified" | "fake",
      })),
      5000,
    );

    let myId: string | null = null;
    if (data.token) {
      try {
        const { requireUser } = await import("./server/user.server");
        const { row } = await requireUser(data.token, { allowSuspended: true });
        myId = row.id;
      } catch {
        myId = null;
      }
    }

    const top = ranked.slice(0, 50);
    const names = new Map<string, { name: string; suspended: boolean }>();
    if (top.length > 0) {
      const { data: people } = await client
        .from("users")
        .select("id, first_name, username, suspended")
        .in("id", top.map((t) => t.referrerId));
      for (const p of people ?? []) {
        names.set(p.id as string, {
          name: ((p.first_name as string) || (p.username as string) || "Farmer").slice(0, 24),
          suspended: Boolean(p.suspended),
        });
      }
    }

    const rows = top
      .filter((t) => !names.get(t.referrerId)?.suspended)
      .map((t, i) => ({
        rank: i + 1,
        name: names.get(t.referrerId)?.name ?? "Farmer",
        active: t.active,
        total: t.total,
        isMe: t.referrerId === myId,
      }));
    const idx = myId ? ranked.findIndex((t) => t.referrerId === myId) : -1;
    return { rows, myRank: idx >= 0 ? idx + 1 : null };
  });
