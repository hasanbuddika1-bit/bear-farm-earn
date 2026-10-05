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

        const { sendMessage, sendPhoto } = await import("@/lib/server/telegram.server");
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
          const name = (update.message?.from?.first_name ?? "farmer")
            .replace(/[<>&]/g, "")
            .slice(0, 40);
          const origin = new URL(request.url).origin;
          await sendPhoto(
            chatId,
            `${origin}/bear-farm-banner.png`,
            `🐻🌾 <b>WELCOME TO BEAR FARM</b> 🌾🐻\n\n` +
              `👋 Hey <b>${name}</b>, your farm is ready!\n` +
              `Grow tokens every day and turn them into real <b>USDT</b> 💚\n\n` +
              `⛏️ <b>Mine</b> — +${config.miningRewardPerCycle} ${config.tokenSymbol} every ${config.miningCycleMinutes} min\n` +
              `🎁 <b>Daily reward</b> — up to ${Math.max(...config.dailyRewards)} ${config.tokenSymbol} a day\n` +
              `✅ <b>Tasks</b> — join channels, earn instantly\n` +
              `👥 <b>Invite friends</b> — earn on every friend\n` +
              `💸 <b>Withdraw</b> — ${config.tokensPerUsd.toLocaleString("en-US")} ${config.tokenSymbol} = $1 USDT (BEP-20)\n\n` +
              `🔒 Every payout is posted publicly in our payment channel.\n\n` +
              `👇 <b>Tap below and start farming!</b>`,
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
