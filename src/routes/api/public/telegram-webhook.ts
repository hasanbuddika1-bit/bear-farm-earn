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
            `🐻🌾 <b>WELCOME TO BEAR FARM</b> 🌾🐻\n` +
              `━━━━━━━━━━━━━━━━━━━━\n\n` +
              `👋 Hi <b>${update.message?.from?.first_name ?? "farmer"}</b>!\n` +
              `Your own little farm that grows real money. 💚\n\n` +
              `⛏️ <b>MINING</b>\n` +
              `• +${config.miningRewardPerCycle} ${config.tokenSymbol} every ${config.miningCycleMinutes} minutes\n` +
              `• One tap to start, claim when the timer ends\n\n` +
              `🎁 <b>DAILY REWARD</b>\n` +
              `• Day 1 → 7: ${config.dailyRewards.join(" · ")} ${config.tokenSymbol}\n` +
              `• Resets every day at 00:00 UTC\n\n` +
              `✅ <b>TASKS</b>\n` +
              `• Daily, main and partner tasks\n` +
              `• Join our channels for instant rewards\n\n` +
              `📺 <b>WATCH ADS</b>\n` +
              `• Quick ads, quick tokens\n\n` +
              `👥 <b>INVITE FRIENDS</b>\n` +
              `• Earn on every friend who farms with you\n\n` +
              `💸 <b>WITHDRAW REAL USDT</b>\n` +
              `• ${config.tokensPerUsd.toLocaleString("en-US")} ${config.tokenSymbol} = $1 USDT (BEP-20)\n` +
              `• Every payout is posted in our payment channel\n\n` +
              `📣 Community: ${config.communityChannelUrl}\n` +
              `💸 Payouts: ${config.paymentChannelUrl}\n\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `👇 Tap below and start farming now!`,
          );
        } else if (text.startsWith("/help")) {
          const config = await loadConfig();
          await sendMessage(
            chatId,
            `🐻 <b>BEAR FARM · HELP</b>\n` +
              `━━━━━━━━━━━━━━━━━━━━\n\n` +
              `⛏️ <b>Mining</b> — start it in the app, claim after ${config.miningCycleMinutes} minutes.\n` +
              `🎁 <b>Daily reward</b> — resets at 00:00 UTC; keep the streak for bigger prizes.\n` +
              `✅ <b>Tasks</b> — channel tasks are checked by the bot, so join first and then claim.\n` +
              `👥 <b>Refer</b> — share your link; friends must farm a little before you get paid.\n` +
              `💸 <b>Withdraw</b> — USDT BEP-20 only, one wallet per account.\n\n` +
              `📣 Community: ${config.communityChannelUrl}\n` +
              `💸 Payouts: ${config.paymentChannelUrl}\n\n` +
              `Anything else? Ask in the community channel. 💚`,
          );
        }

        return new Response("ok");
      },
    },
  },
});
