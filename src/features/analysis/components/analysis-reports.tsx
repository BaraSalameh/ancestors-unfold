import { useQuery } from "@tanstack/react-query";
import type { TranslationKey } from "@/locales";
import { useI18n } from "@/shared/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { getAnalysisReport } from "../client/analysis-api";
import { branchReportMetricValue, branchReportSections } from "../domain/branch-report-projection";
import type { BranchReportRow, QualityReportData, RelationshipReportData } from "../domain/types";

type ReportKind = "branches" | "relationships" | "quality";

type QualityMetricKey = Exclude<keyof QualityReportData, "no_parents_recorded">;
type QualityMetric = readonly [QualityMetricKey, TranslationKey];

const qualityMetrics = [
  ["total", "analysis_total_members"],
  ["missing_name_en", "analysis_missing_name_en"],
  ["missing_name_ar", "analysis_missing_name_ar"],
  ["missing_birth_date", "analysis_missing_birth"],
  ["missing_citizenship", "analysis_missing_citizenship"],
  ["missing_branch", "analysis_missing_branch"],
  ["missing_image", "analysis_missing_image"],
  ["unknown_placeholders", "analysis_unknown_placeholders"],
  ["missing_parent", "analysis_missing_parent"],
  ["possible_duplicate_groups", "analysis_possible_duplicates"],
  ["contradictory_dates", "analysis_contradictory_dates"],
  ["graph_cycles", "analysis_graph_cycles"],
] as const satisfies readonly QualityMetric[];

function FactCard({ value, label }: { value: number; label: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export function QualityReport({ data }: { data: QualityReportData }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {qualityMetrics.map(([key, label]) => (
        <FactCard key={key} value={data[key]} label={t(label)} />
      ))}
    </div>
  );
}

function RelationshipMetric({
  label,
  description,
  value,
}: {
  label: string;
  description: string;
  value: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function RelationshipBreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}

export function RelationshipReport({ data }: { data: RelationshipReportData }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <RelationshipMetric
        label={t("analysis_total_members")}
        description={t("analysis_relationship_total_description")}
        value={data.total_members}
      />
      <RelationshipMetric
        label={t("analysis_married")}
        description={t("analysis_married_description")}
        value={data.married_males}
      />
      <RelationshipMetric
        label={t("analysis_divorce")}
        description={t("analysis_divorce_description")}
        value={data.divorced_males}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("analysis_single")}</CardTitle>
          <CardDescription>{t("analysis_single_description")}</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <RelationshipBreakdownRow
            label={t("analysis_single_18_24")}
            value={data.single_males_18_24}
          />
          <RelationshipBreakdownRow
            label={t("analysis_single_25_plus")}
            value={data.single_males_25_plus}
          />
        </CardContent>
      </Card>
      <RelationshipMetric
        label={t("analysis_no_children_recorded")}
        description={t("analysis_no_children_description")}
        value={data.married_males_no_children}
      />
    </div>
  );
}

function BranchMetric({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <div className="font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function BranchReport({ rows }: { rows: BranchReportRow[] }) {
  const { t, lang } = useI18n();
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">{t("analysis_no_results")}</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.map((row) => (
        <Card key={row.id}>
          <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
            <CardTitle className="min-w-0 break-words">
              {lang === "ar" ? row.name_ar || row.name_en : row.name_en || row.name_ar}
            </CardTitle>
            <div className="shrink-0 text-end">
              <div className="text-xs text-muted-foreground">{t("analysis_completeness")}</div>
              <div className="font-bold tabular-nums">{row.completeness_percent}%</div>
            </div>
          </CardHeader>
          <CardContent className="divide-y text-sm">
            {branchReportSections.map((section) => (
              <section key={section.label} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(section.label)}
                </h3>
                <div
                  className={
                    section.metrics.length === 2
                      ? "grid grid-cols-2 gap-2"
                      : "grid grid-cols-2 gap-2 sm:grid-cols-3"
                  }
                >
                  {section.metrics.map(([key, label]) => (
                    <BranchMetric
                      key={key}
                      value={branchReportMetricValue(row, key)}
                      label={t(label)}
                    />
                  ))}
                </div>
              </section>
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
  excludeWives = false,
}: {
  treeId: string;
  branchId: string | null;
  report: ReportKind;
  excludeWives?: boolean;
}) {
  const { t } = useI18n();
  const appliedExcludeWives = report === "branches" && excludeWives;
  const query = useQuery({
    queryKey: ["analysis", treeId, branchId, report, appliedExcludeWives],
    queryFn: ({ signal }) =>
      getAnalysisReport<BranchReportRow[] | RelationshipReportData | QualityReportData>(
        treeId,
        branchId,
        report,
        appliedExcludeWives,
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
  if (report === "branches") return <BranchReport rows={(data ?? []) as BranchReportRow[]} />;
  if (report === "relationships")
    return <RelationshipReport data={(data ?? {}) as RelationshipReportData} />;
  return <QualityReport data={(data ?? {}) as QualityReportData} />;
}
