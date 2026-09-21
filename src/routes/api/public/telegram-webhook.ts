import { createFileRoute } from "@tanstack/react-router";

/** Telegram bot webhook. Authenticated with Telegram's secret token header. */
export const Route = createFileRoute("/api/public/telegram-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BEARFARM_TG_WEBHOOK_SECRET"];
        if (!secret) return new Response("not configured", { status: 503 });
        if (request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
          return new Response("unauthorised", { status: 401 });
        }

        const { sendMessage } = await import("@/lib/server/telegram.server");
        const { loadConfig } = await import("@/lib/server/config.server");

        let update: {
          message?: { chat?: { id?: number }; text?: string; from?: { first_name?: string } };
        };
        try {
          update = JSON.parse(await request.text());
        } catch {
          return new Response("ok");
        }

        const chatId = update.message?.chat?.id;
        const text = (update.message?.text ?? "").trim();
        if (!chatId) return new Response("ok");

        if (text.startsWith("/start")) {
          const config = await loadConfig();
          await sendMessage(
            chatId,
            `🐻 <b>Welcome to Bear Farm, ${update.message?.from?.first_name ?? "farmer"}!</b>\n\n` +
              `🌾 Mine ${config.miningRewardPerCycle} ${config.tokenSymbol} every ${config.miningCycleMinutes} minutes\n` +
              `🎁 Daily rewards up to ${config.dailyRewards.at(-1) ?? 150} ${config.tokenSymbol}\n` +
              `📺 Watch ads and finish tasks for more\n` +
              `👥 Invite friends and earn together\n` +
              `💸 Withdraw real USDT (BEP-20)\n\n` +
              `Tap the button below to open your farm 👇`,
          );
        } else if (text.startsWith("/help")) {
          await sendMessage(
            chatId,
            "🐻 <b>Bear Farm help</b>\n\n⛏️ Mining runs in the app\n🎁 Daily reward resets at 00:00 UTC\n💸 Withdrawals are paid to USDT BEP-20\n\nOpen the app for everything else.",
          );
        }

        return new Response("ok");
      },
    },
  },
});
