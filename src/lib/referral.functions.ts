import { createServerFn } from "@tanstack/react-start";

import type { ReferralRow } from "./types";

export const listReferrals = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => ({ token: String(input?.token ?? "") }))
  .handler(
    async ({
      data,
    }): Promise<{
      rows: ReferralRow[];
      total: number;
      active: number;
      unclaimed: number;
      totalEarned: number;
      link: string;
    }> => {
      const { requireUser } = await import("./server/user.server");
      const { loadConfig } = await import("./server/config.server");
      const { db } = await import("./server/db.server");

      const { row } = await requireUser(data.token);
      const config = await loadConfig();
      const client = db();

      const { data: refs } = await client
        .from("referrals")
        .select("id, referred_id, stage, earned, claimed, ads_day1, ads_day2, created_at")
        .eq("referrer_id", row.id)
        .order("created_at", { ascending: false })
        .limit(200);

      const list = refs ?? [];
      const ids = list.map((r) => r.referred_id as string);
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: people } = await client
          .from("users")
          .select("id, first_name, username")
          .in("id", ids);
        for (const p of people ?? []) {
          names.set(
            p.id as string,
            ((p.first_name as string) || (p.username as string) || "Farmer").slice(0, 24),
          );
        }
      }

      const rows: ReferralRow[] = list.map((r) => ({
        id: String(r.id),
        name: names.get(r.referred_id as string) ?? "Farmer",
        stage: r.stage as ReferralRow["stage"],
        earned: Number(r.earned),
        adsWatched: Number(r.ads_day1) + Number(r.ads_day2),
        createdAt: Date.parse(r.created_at as string),
      }));

      return {
        rows,
        total: rows.length,
        active: rows.filter((r) => r.stage === "half" || r.stage === "verified").length,
        unclaimed: Number(row.referral_pot),
        totalEarned: rows.reduce((sum, r) => sum + (r.stage === "fake" ? 0 : r.earned), 0),
        link: `${config.referralLink}${row.telegram_id}`,
      };
    },
  );

/** Referral earnings sit in a separate pot until the user claims them. */
export const claimReferralEarnings = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; idempotencyKey: string }) => ({
    token: String(input?.token ?? ""),
    idempotencyKey: String(input?.idempotencyKey ?? "").slice(0, 120),
  }))
  .handler(async ({ data }): Promise<{ awarded: number; balance: number }> => {
    const { requireUser } = await import("./server/user.server");
    const { award } = await import("./server/ledger.server");
    const { rateLimit } = await import("./server/session.server");
    const { db } = await import("./server/db.server");

    const { row } = await requireUser(data.token);
    await rateLimit(`refclaim:${row.id}`, 10, 60);
    const pot = Number(row.referral_pot);
    if (pot <= 0) throw new Error("No referral rewards to claim yet.");

    const cleared = await db()
      .from("users")
      .update({ referral_pot: 0 })
      .eq("id", row.id)
      .eq("referral_pot", pot)
      .select("id");
    if (!cleared.data || cleared.data.length === 0) throw new Error("Please try again.");

    const result = await award({
      userId: row.id,
      amount: pot,
      kind: "referral",
      label: "Referral earnings",
      idempotencyKey: data.idempotencyKey || `ref:${row.id}:${Date.now()}`,
    });
    return { awarded: result.awarded, balance: result.balance };
  });
