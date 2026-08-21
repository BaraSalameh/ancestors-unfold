import { createFileRoute } from "@tanstack/react-router";
import { authSessionQueryKey, type HydratedAuthSession } from "@/features/auth";
import { CollaborationDashboard, dashboardBootstrapQueryOptions } from "@/features/collaboration";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const session = context.queryClient.getQueryData<HydratedAuthSession | null>(
      authSessionQueryKey,
    );
    if (!session?.user.gender) return null;
    return context.queryClient.ensureQueryData(dashboardBootstrapQueryOptions(session.locale));
  },
  head: () => ({
    meta: [
      { title: "DashboardPage | Ancestors Unfold" },
      { name: "description", content: "Manage and explore your family trees." },
    ],
  }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return <CollaborationDashboard initialBootstrap={Route.useLoaderData()} />;
}
