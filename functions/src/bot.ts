import { onRequest } from "firebase-functions/v2/https";
import { TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, col, nowMs } from "./lib/init";
import { getConfig } from "./lib/config";
import { miniAppButton, sendMessage } from "./lib/telegram";

const BANNER = "https://raw.githubusercontent.com/bearfarm-assets/main/banner.png";

/**
 * Telegram webhook. Telegram's own secret-token header is the only accepted caller,
 * so nobody can fake updates.
 */
export const telegramWebhook = onRequest(
  { secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("method not allowed");
      return;
    }
    if (req.header("x-telegram-bot-api-secret-token") !== TELEGRAM_WEBHOOK_SECRET.value()) {
      res.status(401).send("unauthorized");
      return;
    }

    const update = req.body as {
      message?: { chat?: { id?: number }; from?: { id?: number }; text?: string };
    };
    const chatId = update.message?.chat?.id;
    const text = update.message?.text ?? "";
    if (!chatId) {
      res.status(200).send("ok");
      return;
    }

    const config = await getConfig();
    if (text.startsWith("/start")) {
      await sendMessage(
        TELEGRAM_BOT_TOKEN.value(),
        chatId,
        `🐻🌾 <b>Bear Farm</b>\n\n⛏️ Mine ${config.miningRewardPerCycle} ${config.tokenSymbol} every ${config.miningCycleMinutes} minutes\n✅ Daily tasks and rewards\n👥 Invite friends for up to ${config.referralJoinReward + config.referralStage1Reward + config.referralStage2Reward} ${config.tokenSymbol}\n💵 Withdraw USDT (BEP-20)`,
        [
          ...miniAppButton(config.botUsername),
          [
            { text: "📣 Community", url: config.communityChannelUrl },
            { text: "💸 Payouts", url: config.paymentChannelUrl },
          ],
        ],
        BANNER,
      );
    } else {
      await sendMessage(
        TELEGRAM_BOT_TOKEN.value(),
        chatId,
        "🐻 Open the mini app to farm your tokens.",
        miniAppButton(config.botUsername),
      );
    }

    await col.audit().add({ uid: "bot", action: "update", detail: { chatId }, createdAt: nowMs() });
    res.status(200).send("ok");
  },
);
