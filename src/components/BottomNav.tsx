import { Link } from "@tanstack/react-router";
import { Home, ListChecks, PlayCircle, Users, User } from "lucide-react";
import { haptic } from "@/lib/telegram";

const ITEMS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/tasks", label: "Task", icon: ListChecks },
  { to: "/ads", label: "Ads", icon: PlayCircle, center: true },
  { to: "/refer", label: "Refer", icon: Users },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg">
      <div className="mx-auto flex max-w-md items-end justify-between px-3 pt-2 pb-2">
        {ITEMS.map(({ to, label, icon: Icon, center }) => (
          <Link
            key={to}
            to={to}
            onClick={() => haptic("light")}
            className={
              center
                ? "-mt-7 flex w-[22%] flex-col items-center gap-1"
                : "flex w-[19.5%] flex-col items-center gap-1 py-1"
            }
            activeOptions={{ exact: to === "/" }}
          >
            {({ isActive }) =>
              center ? (
                <>
                  <span
                    className={`flex size-16 items-center justify-center rounded-full border-4 border-card ${
                      isActive ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"
                    } shadow-[var(--shadow-glow)]`}
                  >
                    <Icon className="size-8" />
                  </span>
                  <span
                    className={`font-display text-[11px] font-bold ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {label}
                  </span>
                </>
              ) : (
                <>
                  <Icon
                    className={`size-6 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <span
                    className={`font-display text-[11px] font-bold ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {label}
                  </span>
                </>
              )
            }
          </Link>
        ))}
      </div>
    </nav>
  );
}
