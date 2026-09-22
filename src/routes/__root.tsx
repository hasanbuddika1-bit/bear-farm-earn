import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LoadingScreen, SuspendedScreen } from "@/components/LoadingScreen";
import { BottomNav } from "@/components/BottomNav";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-extrabold gold-text">404</h1>
        <h2 className="mt-4 font-display text-xl font-bold">This barn is empty</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for is not part of the farm.
        </p>
        <Link
          to="/"
          className="btn-pop active:btn-pop-active mt-6 inline-flex rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground"
        >
          Back to farm
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-bold">Something broke on the farm</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Try again, or reopen the mini app from Telegram.
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="btn-pop active:btn-pop-active mt-6 rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      },
      { title: "Bear Farm — Earn USDT" },
      {
        name: "description",
        content: "Bear Farm Telegram mini app: mine tokens, finish tasks, refer friends and withdraw USDT (BEP-20).",
      },
      { property: "og:title", content: "Bear Farm — Earn USDT" },
      {
        property: "og:description",
        content: "Mine, complete tasks and withdraw USDT BEP-20 from the Bear Farm mini app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700;800&display=swap",
      },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppGate />
      </AuthProvider>
      <Toaster position="top-center" theme="dark" richColors />
    </QueryClientProvider>
  );
}

function AppGate() {
  const { status, error, user, retry } = useAuth();

  if (status !== "ready" || !user) {
    return <LoadingScreen status={status} error={error} onRetry={retry} />;
  }

  if (user.suspended) {
    return <SuspendedScreen reason={user.suspendedReason} />;
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md safe-bottom">
      <Outlet />
      <BottomNav />
    </div>
  );
}
