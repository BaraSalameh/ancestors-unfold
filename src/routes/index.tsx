import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/trees/pages/dashboard-page";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DashboardPage | Ancestors Unfold" },
      { name: "description", content: "Manage and explore your family trees." },
    ],
  }),
  component: DashboardPage,
});
