import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";

/**
 * Firebase client configuration.
 * These values are publishable identifiers (NOT secrets). Data protection comes
 * from Firestore Security Rules, App Check and Cloud Functions authorization.
 * The API key is read from the environment so it can be rotated per deployment.
 */
export const firebaseConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] ?? "",
  authDomain: "bearfarm-47ec7.firebaseapp.com",
  projectId: "bearfarm-47ec7",
  storageBucket: "bearfarm-47ec7.firebasestorage.app",
  messagingSenderId: "377024316625",
  appId: "1:377024316625:web:0b5b52eb9d26b96e33b1f0",
};

export const FUNCTIONS_REGION = "us-central1";

export const isFirebaseConfigured = () => Boolean(firebaseConfig.apiKey);

let app: FirebaseApp | null = null;
let appCheckStarted = false;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("FIREBASE_CONFIG_MISSING");
  }
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
  }
  if (typeof window !== "undefined" && !appCheckStarted) {
    appCheckStarted = true;
    void initAppCheck(app);
  }
  return app;
}

/** App Check (reCAPTCHA v3) — blocks unauthenticated abuse of the backend. */
async function initAppCheck(firebaseApp: FirebaseApp) {
  const siteKey = import.meta.env["VITE_FIREBASE_APPCHECK_SITE_KEY"];
  if (!siteKey) return;
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import("firebase/app-check");
    const debugToken = import.meta.env["VITE_FIREBASE_APPCHECK_DEBUG_TOKEN"];
    if (debugToken) {
      (globalThis as Record<string, unknown>)["FIREBASE_APPCHECK_DEBUG_TOKEN"] = debugToken;
    }
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("App Check init failed", error);
  }
}

let authInstance: Auth | null = null;
export function firebaseAuth(): Auth {
  if (!authInstance) authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

let dbInstance: Firestore | null = null;
export function firestore(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}

let fnsInstance: Functions | null = null;
export function functions(): Functions {
  if (!fnsInstance) fnsInstance = getFunctions(getFirebaseApp(), FUNCTIONS_REGION);
  return fnsInstance;
}

/** Typed callable helper. All sensitive logic lives in Cloud Functions. */
export function callable<TReq, TRes>(name: string) {
  return async (payload?: TReq): Promise<TRes> => {
    const fn = httpsCallable<TReq, TRes>(functions(), name);
    const result = await fn((payload ?? {}) as TReq);
    return result.data;
  };
}
