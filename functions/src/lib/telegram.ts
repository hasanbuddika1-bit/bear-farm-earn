import { createHmac, timingSafeEqual } from "crypto";
import { HttpsError } from "./init";

export interface TelegramUser {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  isPremium: boolean;
}

const MAX_INIT_DATA_AGE_SECONDS = 900;

/**
 * Verifies Telegram WebApp initData (HMAC-SHA256 with key HMAC("WebAppData", botToken)).
 * Nothing about the caller is trusted before this passes.
 */
export function verifyInitData(initData: string, botToken: string): TelegramUser {
  if (typeof initData !== "string" || initData.length < 10 || initData.length > 4096) {
    throw new HttpsError("invalid-argument", "Invalid Telegram session data.");
  }
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new HttpsError("unauthenticated", "Telegram signature missing.");
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const a = Buffer.from(hash.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpsError("unauthenticated", "Telegram signature is invalid.");
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    throw new HttpsError("unauthenticated", "Telegram session expired. Reopen the mini app.");
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(params.get("user") ?? "{}") as Record<string, unknown>;
  } catch {
    throw new HttpsError("unauthenticated", "Telegram user payload is malformed.");
  }
  const id = Number(parsed["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpsError("unauthenticated", "Telegram user id missing.");
  }

  return {
    id,
    username: typeof parsed["username"] === "string" ? parsed["username"] : null,
    firstName: typeof parsed["first_name"] === "string" ? parsed["first_name"] : null,
    lastName: typeof parsed["last_name"] === "string" ? parsed["last_name"] : null,
    photoUrl: typeof parsed["photo_url"] === "string" ? parsed["photo_url"] : null,
    isPremium: parsed["is_premium"] === true,
  };
}

async function tg<T>(botToken: string, method: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? "unknown"}`);
  return json.result as T;
}

export interface InlineButton {
  text: string;
  url: string;
}

/** Bot messages never block the user flow — failures are logged, not thrown. */
export async function sendMessage(
  botToken: string,
  chatId: string | number,
  text: string,
  buttons: InlineButton[][] = [],
  photoUrl?: string,
) {
  try {
    const markup = buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {};
    if (photoUrl) {
      await tg(botToken, "sendPhoto", {
        chat_id: chatId,
        photo: photoUrl,
        caption: text,
        parse_mode: "HTML",
        ...markup,
      });
      return;
    }
    await tg(botToken, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...markup,
    });
  } catch (err) {
    console.error("sendMessage failed", err);
  }
}

const JOINED = new Set(["member", "administrator", "creator"]);

/** Server-side membership check — the client cannot claim a join itself. */
export async function isChatMember(botToken: string, chatId: string, telegramId: number) {
  try {
    const result = await tg<{ status: string }>(botToken, "getChatMember", {
      chat_id: chatId,
      user_id: telegramId,
    });
    return JOINED.has(result.status);
  } catch (err) {
    console.error("getChatMember failed", err);
    return false;
  }
}

export function miniAppButton(botUsername: string): InlineButton[][] {
  return [[{ text: "🐻 Open mini app", url: `https://t.me/${botUsername}?startapp=1` }]];
}
