import { createFileRoute } from "@tanstack/react-router";
import { MemberPage } from "@/features/members";

export const Route = createFileRoute("/member/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnPreview:
      search.returnPreview === "chronological" ? ("chronological" as const) : ("lineage" as const),
  }),
  head: () => ({ meta: [{ title: "Member Details — Family Tree Hub" }] }),
  component: MemberPage,
});
