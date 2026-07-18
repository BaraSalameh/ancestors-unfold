import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { FamilyTree } from "@/components/FamilyTree";
import { familyStore, useFamilyLoadState } from "@/lib/family-store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/tree/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "preview" ? ("preview" as const) : ("edit" as const),
  }),
  head: () => ({ meta: [{ title: "Family Tree | Ancestors Unfold" }] }),
  component: TreePage,
});

function TreePage() {
  const { mode } = Route.useSearch();
  const { id } = Route.useParams();
  const { t } = useI18n();
  familyStore.activateTree(id, mode);
  const loadState = useFamilyLoadState();
  if (loadState === "loading" || loadState === "idle")
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
        <LoaderCircle
          className="h-7 w-7 animate-spin text-primary"
          aria-label={t("loading_tree")}
        />
      </div>
    );
  if (loadState === "error")
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center p-6 text-center">
        <div>
          <TriangleAlert className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="mt-3 text-lg font-semibold">{t("tree_unavailable")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("tree_unavailable_hint")}</p>
        </div>
      </div>
    );
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <FamilyTree readOnly={mode === "preview"} />
    </div>
  );
}
