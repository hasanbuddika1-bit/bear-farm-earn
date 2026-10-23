import { toast } from "sonner";

export type PopupData =
  | { kind: "reward"; amount: number; title: string; emoji: string }
  | { kind: "noad" };

export class NoAdError extends Error {
  constructor() {
    super("No ad available right now. Please try again.");
    this.name = "NoAdError";
  }
}

type Listener = (p: PopupData | null) => void;
const listeners = new Set<Listener>();

export function subscribePopup(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function emit(p: PopupData | null) {
  for (const l of listeners) l(p);
}

export function closePopup() {
  emit(null);
}

export function showReward(amount: number, title: string, emoji = "🎉") {
  emit({ kind: "reward", amount, title, emoji });
}

export function showNoAd() {
  emit({ kind: "noad" });
}

/** No-ad errors open the popup; anything else is a toast. */
export function notifyError(e: unknown) {
  if (e instanceof NoAdError || (e instanceof Error && e.name === "NoAdError")) {
    showNoAd();
    return;
  }
  toast.error(e instanceof Error ? e.message : "Something went wrong. Try again.");
}
