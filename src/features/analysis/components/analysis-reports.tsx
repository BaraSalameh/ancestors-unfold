import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/shared/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { getAnalysisReport } from "../client/analysis-api";

type ReportKind = "branches" | "relationships" | "quality";

const reportLabels: Record<string, string> = {
  living: "living",
  deceased: "deceased",
  male: "male",
  female: "female",
  unspecified_gender: "gender_unspecified",
  adults: "analysis_adults",
  total_members: "analysis_total_members",
  parent_links: "analysis_parent_links",
  zero_parents: "analysis_zero_parents",
  one_parent: "analysis_one_parent",
  two_parents: "analysis_two_parents",
  roots: "analysis_roots",
  leaves: "analysis_leaves",
  no_children_recorded: "analysis_no_children_recorded",
  largest_recorded_child_count: "analysis_largest_child_count",
  unions: "analysis_unions",
  active_unions: "analysis_active_unions",
  divorced_unions: "analysis_divorced_unions",
  maximum_generation_depth: "analysis_generation_depth",
  total: "analysis_total_members",
  missing_name_en: "analysis_missing_name_en",
  missing_name_ar: "analysis_missing_name_ar",
  missing_birth_date: "analysis_missing_birth",
  missing_citizenship: "analysis_missing_citizenship",
  missing_branch: "analysis_missing_branch",
  missing_image: "analysis_missing_image",
  unknown_placeholders: "analysis_unknown_placeholders",
  no_parents_recorded: "analysis_no_parents_recorded",
  possible_duplicate_groups: "analysis_possible_duplicates",
  contradictory_dates: "analysis_contradictory_dates",
  graph_cycles: "analysis_graph_cycles",
  minors: "analysis_minors",
  unknown_age: "analysis_unknown_age",
  age_18_29: "analysis_age_18_29",
  age_30_44: "analysis_age_30_44",
  age_45_59: "analysis_age_45_59",
  age_60_74: "analysis_age_60_74",
  age_75_plus: "analysis_age_75_plus",
  resident: "resident",
  non_resident: "non_resident",
  unknown_citizenship: "analysis_unknown_citizenship",
  completeness_percent: "analysis_completeness",
};

function ReportFacts({ data }: { data: Record<string, unknown> }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(data).map(([key, value]) => (
        <Card key={key}>
          <CardContent className="p-4">
            <div className="text-2xl font-bold tabular-nums">{String(value ?? 0)}</div>
            <div className="text-xs text-muted-foreground">
              {t((reportLabels[key] ?? "analysis_total_members") as Parameters<typeof t>[0])}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function BranchReport({ rows }: { rows: Array<Record<string, unknown>> }) {
  const { t, lang } = useI18n();
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">{t("analysis_no_results")}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((row) => (
        <Card key={String(row.id)}>
          <CardHeader>
            <CardTitle>
              {String(lang === "ar" ? row.name_ar || row.name_en : row.name_en || row.name_ar)}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-sm">
            {Object.entries(row)
              .filter(([key]) => !["id", "name_en", "name_ar"].includes(key))
              .map(([key, value]) => (
                <div key={key} className="rounded-lg bg-muted/60 p-3">
                  <div className="font-bold tabular-nums">{String(value ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">
                    {t((reportLabels[key] ?? "analysis_total_members") as Parameters<typeof t>[0])}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AnalysisReport({
  treeId,
  branchId,
  report,
}: {
  treeId: string;
  branchId: string | null;
  report: ReportKind;
}) {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: ["analysis", treeId, branchId, report],
    queryFn: ({ signal }) =>
      getAnalysisReport<Record<string, unknown> | Array<Record<string, unknown>>>(
        treeId,
        branchId,
        report,
        signal,
      ),
    staleTime: 60_000,
  });
  if (query.isLoading)
    return (
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    );
  if (query.isError)
    return (
      <p className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
        {t("analysis_load_failed")}
      </p>
    );
  const data = query.data?.data;
  return report === "branches" ? (
    <BranchReport rows={(data ?? []) as Array<Record<string, unknown>>} />
  ) : (
    <ReportFacts data={(data ?? {}) as Record<string, unknown>} />
  );
}
