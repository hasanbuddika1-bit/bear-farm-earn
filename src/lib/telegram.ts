/** Minimal typings + helpers for the Telegram WebApp bridge. */
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      photo_url?: string;
    };
    start_param?: string;
  };
  version: string;
  colorScheme: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openTelegramLink: (url: string) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
}

export function telegram(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return tg ?? null;
}

export function initTelegram() {
  const tg = telegram();
  if (!tg) return null;
  try {
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
    tg.setHeaderColor?.("#123227");
    tg.setBackgroundColor?.("#123227");
  } catch {
    /* older clients */
  }
  return tg;
}

export function haptic(type: "light" | "medium" | "heavy" = "light") {
  telegram()?.HapticFeedback?.impactOccurred(type);
}

export function hapticNotify(type: "success" | "error" | "warning") {
  telegram()?.HapticFeedback?.notificationOccurred(type);
}

export function openExternal(url: string) {
  const tg = telegram();
  if (!url) return;
  if (tg && /(^https:\/\/t\.me\/)|(^tg:\/\/)/.test(url)) {
    tg.openTelegramLink(url);
    return;
  }
  if (tg) {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function shareReferral(link: string, text: string) {
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  openExternal(url);
}
