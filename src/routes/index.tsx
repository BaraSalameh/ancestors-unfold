import { createFileRoute } from "@tanstack/react-router";
import { CollaborationDashboard } from "@/features/trees";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DashboardPage | Ancestors Unfold" },
      { name: "description", content: "Manage and explore your family trees." },
    ],
  }),
  component: CollaborationDashboard,
});
