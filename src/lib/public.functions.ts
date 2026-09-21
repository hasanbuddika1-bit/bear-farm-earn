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
