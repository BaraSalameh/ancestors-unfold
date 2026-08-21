import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage, activityQueryOptions } from "@/features/activity";
import { authSessionQueryKey, type AuthSession } from "@/features/auth";

export const Route = createFileRoute("/activity")({
  loader: async ({ context }) => {
    const session = context.queryClient.getQueryData<AuthSession | null>(authSessionQueryKey);
    const tree = session?.currentTree ?? null;
    if (session?.user.gender && tree)
      await context.queryClient.ensureInfiniteQueryData(activityQueryOptions(tree.id, "", "en"));
    return tree;
  },
  head: () => ({ meta: [{ title: "Activity history | Ancestors Unfold" }] }),
  component: ActivityRoute,
});

function ActivityRoute() {
  return <ActivityPage tree={Route.useLoaderData()} />;
}
