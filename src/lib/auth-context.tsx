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
import { onAuthStateChanged, signInWithCustomToken, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";

import { firebaseAuth, firestore, isFirebaseConfigured } from "./firebase";
import { api } from "./api";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("booting");
  const [error, setError] = useState<AuthErrorInfo | null>(null);
  const [user, setUser] = useState<UserDoc | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const unsubUser = useRef<(() => void) | null>(null);

  const retry = useCallback(() => {
    setError(null);
    setStatus("booting");
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!isFirebaseConfigured()) {
        setStatus("unconfigured");
        setError({
          kind: "config",
          title: "Setup required",
          message:
            "Firebase API key is missing. Add VITE_FIREBASE_API_KEY to the environment and redeploy.",
        });
        return;
      }

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
        const { token } = await api.telegramAuth({
          initData,
          startParam,
          deviceId: getDeviceId(),
        });
        if (cancelled) return;
        await signInWithCustomToken(firebaseAuth(), token);
        if (cancelled) return;

        setStatus("syncing");
        const boot = await api.bootstrap();
        if (cancelled) return;
        setConfig(boot.config);
        setServerOffset(boot.serverTime - Date.now());
      } catch (err) {
        if (cancelled) return;
        const e = err as { code?: string; message?: string };
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        const isNetwork =
          offline ||
          e?.code === "functions/unavailable" ||
          e?.code === "functions/deadline-exceeded" ||
          /network|fetch|timeout/i.test(e?.message ?? "");
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

  // Single realtime listener on the signed-in user's own document (read-efficient).
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const unsubAuth = onAuthStateChanged(firebaseAuth(), (fbUser: User | null) => {
      unsubUser.current?.();
      unsubUser.current = null;
      if (!fbUser) {
        setUid(null);
        setUser(null);
        return;
      }
      setUid(fbUser.uid);
      unsubUser.current = onSnapshot(
        doc(firestore(), "users", fbUser.uid),
        (snap) => {
          const data = snap.data() as UserDoc | undefined;
          if (data) {
            setUser(data);
            setStatus((prev) => (prev === "error" ? prev : "ready"));
          }
        },
        () => {
          setStatus("error");
          setError({
            kind: "network",
            title: "Live sync interrupted",
            message: "Your farm data stopped syncing. Tap retry to reconnect.",
          });
        },
      );
    });
    return () => {
      unsubAuth();
      unsubUser.current?.();
      unsubUser.current = null;
    };
  }, [attempt]);

  const value = useMemo<AuthValue>(
    () => ({
      status: config && user ? (status === "error" ? "error" : "ready") : status,
      error,
      user,
      uid,
      config,
      serverOffset,
      retry,
      isAdmin: Boolean(user?.isAdmin),
    }),
    [status, error, user, uid, config, serverOffset, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
