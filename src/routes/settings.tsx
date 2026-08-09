import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/preferences";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Ancestors Unfold" }] }),
  component: SettingsPage,
});
