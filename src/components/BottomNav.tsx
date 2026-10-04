import { Link } from "@tanstack/react-router";
import { ListChecks, Users, User, Wallet } from "lucide-react";
import { haptic } from "@/lib/telegram";

const SIDE = [
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/refer", label: "Refer", icon: Users },
  null,
  { to: "/profile/wallet", label: "Wallet", icon: Wallet },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      <div className="mx-auto flex max-w-md items-end justify-between rounded-3xl border border-primary/25 bg-card/90 px-2 pt-2 pb-2 shadow-[var(--shadow-soft)] backdrop-blur-xl">
        {SIDE.map((item) =>
          item === null ? (
            <Link
              key="farm"
              to="/"
              onClick={() => haptic("light")}
              activeOptions={{ exact: true }}
              className="-mt-9 flex w-[22%] flex-col items-center gap-1"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`relative flex size-16 items-center justify-center rounded-full border-4 border-background bg-[image:var(--gradient-gold)] text-3xl shadow-[var(--shadow-glow)] ${isActive ? "" : "opacity-90"}`}
                  >
                    <span className="absolute inset-0 rounded-full bg-primary/30 animate-pulse-ring" />
                    <span className="relative animate-bob">🐻</span>
                  </span>
                  <span className="font-display text-[11px] font-extrabold text-primary">Farm</span>
                </>
              )}
            </Link>
          ) : (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => haptic("light")}
              activeOptions={{ exact: item.to === "/profile" }}
              className="flex w-[19.5%] flex-col items-center gap-1 py-1"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-11 items-center justify-center rounded-xl transition-colors ${isActive ? "bg-primary/20" : ""}`}
                  >
                    <item.icon className={`size-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  </span>
                  <span
                    className={`font-display text-[11px] font-bold ${isActive ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {item.label}
                  </span>
                </>
              )}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
