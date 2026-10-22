/** Admin Telegram accounts: the configured operator plus extra admins. */
const EXTRA_ADMIN_IDS = ["6513835941"];

export function adminTelegramIds(): string[] {
  const env = (process.env["BEARFARM_ADMIN_TELEGRAM_ID"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...env, ...EXTRA_ADMIN_IDS])];
}

export function isAdminTelegramId(id: string | null | undefined): boolean {
  return Boolean(id) && adminTelegramIds().includes(String(id));
}
