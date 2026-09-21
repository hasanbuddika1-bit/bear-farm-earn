import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { api } from "./api";
import { clearSessionToken, onBalanceChanged } from "./session";
import { initTelegram, telegram } from "./telegram";
import { getDeviceId } from "./device";
import type { AppConfig, UserDoc } from "./types";

export type AuthStatus =
  | "booting"
  | "connecting"
  | "syncing"
  | "ready"
  | "error"
  | "outside-telegram"
  | "unconfigured";

export interface AuthErrorInfo {
  kind: "network" | "telegram" | "server" | "config" | "suspended";
  title: string;
  message: string;
}

interface AuthValue {
  status: AuthStatus;
  error: AuthErrorInfo | null;
  user: UserDoc | null;
  uid: string | null;
  config: AppConfig | null;
  serverOffset: number;
  retry: () => void;
  refresh: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Convenience hook: throws only where a signed-in user is guaranteed. */
export function useUser(): { user: UserDoc; config: AppConfig; uid: string } {
  const { user, config, uid } = useAuth();
  if (!user || !config || !uid) throw new Error("User not loaded");
  return { user, config, uid };
}

const POLL_MS = 20_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [error, setError] = useState<AuthErrorInfo | null>(null);
  const [user, setUser] = useState<UserDoc | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const readyRef = useRef(false);

  const retry = useCallback(() => {
    setError(null);
    setStatus("booting");
    setAttempt((n) => n + 1);
  }, []);

  const refresh = useCallback(() => {
    if (!readyRef.current) return;
    void api
      .me()
      .then((fresh) => setUser(fresh))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const tg = initTelegram();
      const initData = tg?.initData ?? "";
      if (!initData) {
        setStatus("outside-telegram");
        setError({
          kind: "telegram",
          title: "Open inside Telegram",
          message: "Bear Farm only runs inside the Telegram app. Open @Bear_Farmbot to continue.",
        });
        return;
      }

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setStatus("error");
        setError({
          kind: "network",
          title: "No internet connection",
          message: "Check your connection and try again.",
        });
        return;
      }

      try {
        setStatus("connecting");
        const startParam = telegram()?.initDataUnsafe?.start_param ?? null;
        await api.telegramAuth({ initData, startParam, deviceId: getDeviceId() });
        if (cancelled) return;

        setStatus("syncing");
        const boot = await api.bootstrap();
        if (cancelled) return;
        setConfig(boot.config);
        setUser(boot.user);
        setServerOffset(boot.serverTime - Date.now());
        readyRef.current = true;
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        clearSessionToken();
        readyRef.current = false;
        const e = err as { message?: string };
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        const isNetwork = offline || /network|fetch|timeout|failed to fetch/i.test(e?.message ?? "");
        setStatus("error");
        setError(
          isNetwork
            ? {
                kind: "network",
                title: "Network error",
                message: "We could not reach the Bear Farm servers. Please try again.",
              }
            : {
                kind: "server",
                title: "Could not start",
                message: e?.message ?? "Unexpected error while verifying your Telegram account.",
              },
        );
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Polling keeps reads predictable instead of a per-user realtime socket.
  useEffect(() => {
    if (status !== "ready") return;
    const timer = window.setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const stop = onBalanceChanged(refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      stop();
    };
  }, [status, refresh]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      error,
      user,
      uid: user ? String(user.telegramId) : null,
      config,
      serverOffset,
      retry,
      refresh,
      isAdmin: Boolean(user?.isAdmin),
    }),
    [status, error, user, config, serverOffset, retry, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
