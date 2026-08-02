import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import {
  createAnalysisView,
  deleteAnalysisView,
  getSavedAnalysisViews,
} from "../client/analysis-api";
import type { AnalysisQueryDefinition } from "../domain/types";

export function AnalysisSavedViews({
  treeId,
  definition,
  onApply,
}: {
  treeId: string;
  definition: AnalysisQueryDefinition;
  onApply: (definition: AnalysisQueryDefinition) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [targetView, setTargetView] = useState<NonNullable<AnalysisQueryDefinition["view"]>>(
    definition.view ?? "explorer",
  );
  const views = useQuery({
    queryKey: ["analysis-views", treeId],
    queryFn: () => getSavedAnalysisViews(treeId),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["analysis-views", treeId] });
  const save = useMutation({
    mutationFn: () => createAnalysisView(treeId, name, { ...definition, view: targetView }),
    onSuccess: () => {
      setName("");
      void refresh();
      toast.success(t("analysis_view_saved"));
    },
    onError: () => toast.error(t("analysis_view_save_failed")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteAnalysisView(treeId, id),
    onSuccess: () => void refresh(),
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_14rem_auto]">
          <Input
            value={name}
            maxLength={120}
            placeholder={t("analysis_view_name")}
            onChange={(event) => setName(event.target.value)}
          />
          <select
            aria-label={t("analysis_saved_destination")}
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={targetView}
            onChange={(event) =>
              setTargetView(event.target.value as NonNullable<AnalysisQueryDefinition["view"]>)
            }
          >
            {analysisTargets.map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
          <Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            <BookmarkPlus className="h-4 w-4" />
            {t("analysis_save_current_view")}
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2">
        {(views.data?.data ?? []).map((view) => (
          <Card key={view.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="font-semibold">{view.name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(view.updated_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => onApply(view.definition)}>
                  {t("analysis_apply")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("delete")}
                  onClick={() => remove.mutate(view.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!views.isLoading && !views.data?.data.length ? (
        <p className="text-sm text-muted-foreground">{t("analysis_no_saved_views")}</p>
      ) : null}
    </div>
  );
}

const analysisTargets = [
  ["overview", "analysis_overview"],
  ["branches", "analysis_branches"],
  ["relationships", "analysis_relationships"],
  ["quality", "analysis_quality"],
  ["explorer", "analysis_explorer"],
] as const;
