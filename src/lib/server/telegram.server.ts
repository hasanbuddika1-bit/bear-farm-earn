/** Telegram initData verification + bot messaging. Server-only. */

function botToken() {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("Bot token is not configured.");
  return token;
}

const enc = new TextEncoder();

async function hmac(keyData: ArrayBuffer | Uint8Array, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyData as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(message));
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface TelegramUser {
  id: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
}

const MAX_AGE_SECONDS = 900;

/** Verifies the HMAC signature and freshness of Telegram initData. */
export async function verifyInitData(
  initData: string,
): Promise<{ user: TelegramUser; startParam: string | null }> {
  if (!initData || initData.length > 4096) throw new Error("Invalid Telegram session.");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Invalid Telegram session.");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = await hmac(enc.encode("WebAppData"), botToken());
  const computed = toHex(await hmac(secret, dataCheckString));
  if (computed !== hash) throw new Error("Telegram signature check failed.");

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) {
    throw new Error("Telegram session expired. Reopen the mini app.");
  }

  const raw = params.get("user");
  if (!raw) throw new Error("Telegram user missing.");
  const parsed = JSON.parse(raw) as {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
    photo_url?: string;
  };
  if (!parsed?.id) throw new Error("Telegram user missing.");

  return {
    user: {
      id: parsed.id,
      username: parsed.username ?? null,
      firstName: parsed.first_name ?? null,
      lastName: parsed.last_name ?? null,
      photoUrl: parsed.photo_url ?? null,
    },
    startParam: params.get("start_param"),
  };
}

export function miniAppButton(label = "🐻 Open mini app") {
  return {
    inline_keyboard: [
      [{ text: label, url: `https://t.me/${process.env["BEARFARM_BOT_USERNAME"] ?? "Bear_Farmbot"}?startapp=1` }],
    ],
  };
}

/** Fire-and-forget bot message — never blocks a reward transaction. */
export async function sendMessage(
  chatId: string | number,
  text: string,
  withButton = true,
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken()}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...(withButton ? { reply_markup: miniAppButton() } : {}),
      }),
    });
  } catch {
    /* messaging is best-effort */
  }
}

export async function notifyAdmin(text: string) {
  const adminId = process.env["BEARFARM_ADMIN_TELEGRAM_ID"];
  if (adminId) await sendMessage(adminId, text, false);
}

/** Channel membership is checked with the bot, never trusted from the client. */
export async function isChatMember(chatId: string, userId: number): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken()}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${userId}`,
    );
    const json = (await res.json()) as { ok?: boolean; result?: { status?: string } };
    const status = json?.result?.status ?? "";
    return ["creator", "administrator", "member"].includes(status);
  } catch {
    return false;
  }
}
