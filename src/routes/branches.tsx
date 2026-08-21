import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BranchesPage } from "@/features/branches";
import { authSessionQueryKey, type HydratedAuthSession } from "@/features/auth";
import { dashboardBootstrapQueryOptions } from "@/features/collaboration";

export const Route = createFileRoute("/branches")({
  validateSearch: z.object({
    treeId: z.string().uuid().optional().catch(undefined),
    branchId: z.string().uuid().optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => ({ treeId: search.treeId }),
  loader: async ({ context, deps }) => {
    const session = context.queryClient.getQueryData<HydratedAuthSession | null>(
      authSessionQueryKey,
    );
    if (!session?.user.gender) return null;
    const bootstrap = await context.queryClient.ensureQueryData(
      dashboardBootstrapQueryOptions(session.locale),
    );
    if (deps.treeId && bootstrap.tree.id !== deps.treeId) throw new Error("FORBIDDEN");
    return bootstrap;
  },
  component: BranchesRoute,
});

function BranchesRoute() {
  return <BranchesPage initialBootstrap={Route.useLoaderData()} />;
}
