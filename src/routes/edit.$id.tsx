import { createFileRoute } from "@tanstack/react-router";
import { EditPage } from "@/features/members";

export const Route = createFileRoute("/edit/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnPreview:
      search.returnPreview === "chronological" ? ("chronological" as const) : ("lineage" as const),
  }),
  head: () => ({ meta: [{ title: "Edit Member — Family Tree Hub" }] }),
  component: EditPage,
});
