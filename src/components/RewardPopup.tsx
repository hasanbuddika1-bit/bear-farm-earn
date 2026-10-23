import { useEffect, useState } from "react";

import { closePopup, subscribePopup, type PopupData } from "@/lib/popup";

export function RewardPopup() {
  const [p, setP] = useState<PopupData | null>(null);
  useEffect(() => subscribePopup(setP), []);
  if (!p) return null;
  const reward = p.kind === "reward";
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm animate-in fade-in"
      onClick={closePopup}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-3xl bg-gradient-to-br from-[oklch(0.8_0.17_85)] via-[oklch(0.7_0.2_40)] to-[oklch(0.6_0.22_330)] p-[2px] shadow-2xl animate-in zoom-in-75"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[22px] bg-card px-5 pb-5 pt-6 text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.85_0.17_90)] to-[oklch(0.65_0.2_40)] text-5xl shadow-lg animate-bounce">
            {reward ? p.emoji : "📺"}
          </div>
          {reward ? (
            <>
              <p className="mt-4 font-display text-lg font-extrabold">{p.title}</p>
              <p className="mt-1 bg-gradient-to-r from-[oklch(0.88_0.17_90)] to-[oklch(0.7_0.2_40)] bg-clip-text font-display text-4xl font-extrabold text-transparent">
                +{p.amount.toLocaleString()} BFT
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Claimed successfully 🐻🌾</p>
            </>
          ) : (
            <>
              <p className="mt-4 font-display text-lg font-extrabold">No ad right now</p>
              <p className="mt-1 text-sm text-muted-foreground">
                No ad is available at the moment. No reward was given. Please try again.
              </p>
            </>
          )}
          <button
            onClick={closePopup}
            className="mt-5 w-full rounded-2xl bg-gradient-to-r from-[oklch(0.85_0.17_85)] to-[oklch(0.68_0.2_40)] py-3 font-display font-extrabold text-primary-foreground shadow-lg active:scale-95"
          >
            {reward ? "Awesome!" : "🔄 Try again"}
          </button>
        </div>
      </div>
    </div>
  );
}
