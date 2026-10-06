import { createFileRoute } from "@tanstack/react-router";
import { PlayCircle } from "lucide-react";

import { Card, EmptyState } from "@/components/ui-kit";

export const Route = createFileRoute("/ads")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Watch — Bear Farm" },
      { name: "description", content: "Watch short videos to earn Bear Farm tokens. Coming soon." },
      { property: "og:title", content: "Watch — Bear Farm" },
      { property: "og:description", content: "Watch and earn on Bear Farm — coming soon." },
    ],
  }),
  component: WatchPage,
});

function WatchPage() {
  return (
    <div className="pb-6">
      <div className="px-4 pt-4">
        <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
          <PlayCircle className="size-6 text-accent" /> Watch
        </h1>
        <p className="text-xs text-muted-foreground">Watch short videos and earn tokens.</p>
      </div>
      <Card className="mx-4 mt-4">
        <EmptyState emoji="🎬" text="Video rewards are coming soon. Stay tuned, farmer! 🐻🌾" />
      </Card>
    </div>
  );
}
