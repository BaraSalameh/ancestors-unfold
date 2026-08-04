import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { BranchesPage } from "@/features/trees";

export const Route = createFileRoute("/branches")({
  validateSearch: z.object({
    treeId: z.string().uuid().optional().catch(undefined),
    branchId: z.string().uuid().optional().catch(undefined),
  }),
  component: BranchesPage,
});
