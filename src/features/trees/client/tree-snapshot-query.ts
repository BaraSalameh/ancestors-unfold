import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { treeSnapshotSchema } from "../domain/tree-snapshot";

const treeSnapshotRequestSchema = z
  .object({
    treeId: z.string().uuid(),
    mode: z.enum(["edit", "view", "preview"]),
  })
  .strict();

const treeSnapshotQueryKeys = {
  all: ["trees", "snapshot"] as const,
  detail: (treeId: string, mode: "edit" | "view" | "preview") =>
    ["trees", "snapshot", treeId, mode] as const,
};

const readTreeSnapshot = createServerFn({ method: "GET" })
  .validator(treeSnapshotRequestSchema)
  .handler(async ({ data }) => {
    const [{ getRequest }, snapshotReader] = await Promise.all([
      import("@tanstack/react-start/server"),
      import("../server/snapshot-reader"),
    ]);
    const snapshot =
      data.mode === "preview"
        ? await snapshotReader.readPublicSnapshot(data.treeId)
        : await readAuthenticatedSnapshot(getRequest(), data.treeId, snapshotReader.readSnapshot);
    return treeSnapshotSchema.parse(snapshot);
  });

async function readAuthenticatedSnapshot(
  request: Request,
  treeId: string,
  reader: typeof import("../server/snapshot-reader").readSnapshot,
) {
  const { authenticate } = await import("@/features/auth/server");
  const session = await authenticate(request);
  if (!session?.profile_gender) throw new Error("UNAUTHENTICATED");
  return reader(session, crypto.randomUUID(), treeId);
}

export function treeSnapshotQueryOptions(treeId: string, mode: "edit" | "view" | "preview") {
  return queryOptions({
    queryKey: treeSnapshotQueryKeys.detail(treeId, mode),
    queryFn: async () =>
      treeSnapshotSchema.parse(await readTreeSnapshot({ data: { treeId, mode } })),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}
