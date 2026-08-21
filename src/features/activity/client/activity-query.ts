import { infiniteQueryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { activityPageSchema } from "../domain/activity-label";

const activityRequestSchema = z
  .object({
    treeId: z.string().uuid(),
    query: z.string().trim().max(100),
    locale: z.enum(["en", "ar"]),
    cursor: z.string().nullable(),
  })
  .strict();

const activityQueryKeys = {
  all: ["activity"] as const,
  feed: (treeId: string, query: string, locale: "en" | "ar") =>
    ["activity", treeId, { query, locale }] as const,
};

const readActivity = createServerFn({ method: "GET" })
  .validator(activityRequestSchema)
  .handler(async ({ data }) => {
    const [{ getRequest }, { authenticate }, { readActivityPage }, { decodeActivityCursor }] =
      await Promise.all([
        import("@tanstack/react-start/server"),
        import("@/features/auth/server"),
        import("../server/activity-service"),
        import("../server/activity-projection"),
      ]);
    const session = await authenticate(getRequest());
    if (!session?.profile_gender) throw new Error("UNAUTHENTICATED");
    return activityPageSchema.parse(
      await readActivityPage(session, crypto.randomUUID(), {
        treeId: data.treeId,
        limit: 25,
        cursor: decodeActivityCursor(data.cursor),
        query: data.query,
        locale: data.locale,
      }),
    );
  });

export function activityQueryOptions(treeId: string, query: string, locale: "en" | "ar") {
  return infiniteQueryOptions({
    queryKey: activityQueryKeys.feed(treeId, query, locale),
    queryFn: async ({ pageParam }) =>
      activityPageSchema.parse(
        await readActivity({ data: { treeId, query, locale, cursor: pageParam } }),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
