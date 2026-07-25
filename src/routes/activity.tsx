import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/features/activity";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [{ title: "Activity history | Ancestors Unfold" }] }),
  component: ActivityPage,
});
