import { NoAdError } from "./popup";
/** Browser-only Adsgram helper. A reward is only claimed when show() succeeds. */
export const GATE_AD_BLOCK = "int-55404";

type Controller = { show: () => Promise<{ done?: boolean; error?: boolean }> };
declare global {
  interface Window {
    Adsgram?: { init: (o: { blockId: string }) => Controller };
  }
}

let loading: Promise<void> | null = null;
function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.Adsgram) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sad.adsgram.ai/js/sad.min.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("sdk"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** true only when the ad actually played to the end. */
export async function showAdsgram(blockId: string): Promise<boolean> {
  try {
    await loadSdk();
    const ctrl = window.Adsgram?.init({ blockId });
    if (!ctrl) return false;
    const res = await ctrl.show();
    return res?.done !== false && !res?.error;
  } catch {
    return false;
  }
}

/** Shows the interstitial before a claim; throws so nothing is paid if no ad. */
export async function requireGateAd(): Promise<void> {
  const ok = await showAdsgram(GATE_AD_BLOCK);
  if (!ok) throw new NoAdError();
}
