import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/subfamilies")({
  validateSearch: z.object({
    treeId: z.string().uuid().optional().catch(undefined),
    branchId: z.string().uuid().optional().catch(undefined),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/branches", search });
  },
});
