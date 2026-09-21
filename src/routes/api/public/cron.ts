import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled maintenance: refreshes the public stats and audits balances
 * against the append-only ledger. Any mismatch suspends the account and
 * alerts the admin. Protected by a shared cron secret.
 */
export const Route = createFileRoute("/api/public/cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["LOVABLE_CRON_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });
        if (request.headers.get("x-cron-secret") !== secret) {
          return new Response("unauthorised", { status: 401 });
        }

        const { db } = await import("@/lib/server/db.server");
        const { ledgerSum } = await import("@/lib/server/ledger.server");
        const { notifyAdmin } = await import("@/lib/server/telegram.server");
        const client = db();

        // Mark finished mining cycles so the app can show "claim ready".
        await client
          .from("users")
          .update({ mining_claimable: true })
          .lt("mining_ends_at", new Date().toISOString())
          .gt("mining_reward", 0)
          .eq("mining_claimable", false);

        // Audit a rolling slice of accounts: balance must equal the ledger.
        const { data: sample } = await client
          .from("users")
          .select("id, telegram_id, balance, suspended")
          .eq("suspended", false)
          .order("updated_at", { ascending: false })
          .limit(200);

        let flagged = 0;
        for (const user of sample ?? []) {
          const sum = await ledgerSum(user.id as string);
          if (sum !== Number(user.balance)) {
            flagged += 1;
            await client
              .from("users")
              .update({
                suspended: true,
                suspended_reason: "Balance check failed. Contact support.",
              })
              .eq("id", user.id as string);
            await client.from("audit_log").insert({
              actor: "system",
              action: "balance_mismatch_suspend",
              target: user.id as string,
              meta: { balance: Number(user.balance), ledger: sum },
            });
            void notifyAdmin(
              `🚨 Balance mismatch\n👤 ${user.telegram_id}\n💰 balance ${user.balance} vs ledger ${sum}\n🚫 Account suspended.`,
            );
          }
        }

        const [{ count: totalUsers }, { data: paid }] = await Promise.all([
          client.from("users").select("id", { count: "exact", head: true }),
          client.from("withdrawals").select("net_usd").eq("status", "approved").limit(5000),
        ]);
        const paidUsd = (paid ?? []).reduce((sum, w) => sum + Number(w.net_usd), 0);

        await client.from("stats").upsert({
          id: "global",
          total_users: totalUsers ?? 0,
          paid_usd: Math.round(paidUsd * 10000) / 10000,
          updated_at: new Date().toISOString(),
        });

        // Expired admin sessions never linger.
        await client.from("admin_sessions").delete().lt("expires_at", new Date().toISOString());

        return Response.json({ ok: true, audited: (sample ?? []).length, flagged });
      },
    },
  },
});
