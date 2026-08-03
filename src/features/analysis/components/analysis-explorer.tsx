import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { downloadAnalysis, getAnalysisMembers } from "../client/analysis-api";
import type {
  AnalysisBranch,
  AnalysisFilters,
  AnalysisMember,
  AnalysisQueryDefinition,
} from "../domain/types";
import { AnalysisFilterPanel } from "./analysis-explorer-filters";

type MemberPageProps = {
  items: AnalysisMember[];
  total: number;
  nextCursor: string | null;
  isLoading: boolean;
  isError: boolean;
  canGoBack: boolean;
  goBack: () => void;
  goForward: () => void;
};

function AnalysisMemberPage({
  items,
  total,
  nextCursor,
  isLoading,
  isError,
  canGoBack,
  goBack,
  goForward,
}: MemberPageProps) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("analysis_members_found", { count: total })}</CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-destructive">{t("analysis_load_failed")}</p>
        ) : (
          <MemberTable items={items} />
        )}
        {!isError && !isLoading && items.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t("analysis_no_results")}</p>
        ) : null}
        <div className="mt-4 flex justify-between gap-3">
          <Button variant="outline" disabled={!canGoBack} onClick={goBack}>
            {t("back")}
          </Button>
          <Button variant="outline" disabled={!nextCursor} onClick={goForward}>
            {t("analysis_next")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MemberTable({ items }: { items: AnalysisMember[] }) {
  const { t, lang } = useI18n();
  const dash = "—";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b text-start text-muted-foreground">
            {(
              [
                "name_english",
                "gender",
                "analysis_age",
                "analysis_life_status",
                "select_branch",
                "children",
                "analysis_generation",
              ] as const
            ).map((key) => (
              <th key={key} className="p-2 text-start">
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((member) => (
            <tr key={member.id} className="border-b last:border-0">
              <td className="p-2 font-medium">
                {lang === "ar"
                  ? member.name_ar || member.name_en
                  : member.name_en || member.name_ar}
              </td>
              <td className="p-2">
                {t(member.gender === "unspecified" ? "gender_unspecified" : member.gender)}
              </td>
              <td className="p-2 tabular-nums">{member.lifecycle_age ?? dash}</td>
              <td className="p-2">{t(member.is_deceased ? "deceased" : "living")}</td>
              <td className="p-2">
                {lang === "ar"
                  ? member.branch_name_ar || member.branch_name_en || dash
                  : member.branch_name_en || member.branch_name_ar || dash}
              </td>
              <td className="p-2 tabular-nums">{member.child_count}</td>
              <td className="p-2 tabular-nums">{member.generation ?? dash}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalysisExplorer({
  treeId,
  branchId,
  branches,
  definition,
  onDefinitionChange,
}: {
  treeId: string;
  branchId: string | null;
  branches: AnalysisBranch[];
  definition: AnalysisQueryDefinition;
  onDefinitionChange: (definition: AnalysisQueryDefinition) => void;
}) {
  const { t } = useI18n();
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const query = useQuery({
    queryKey: ["analysis-members", treeId, branchId, definition, cursor],
    queryFn: ({ signal }) => getAnalysisMembers(treeId, branchId, definition, cursor, signal),
    staleTime: 30_000,
  });
  const resetPagination = () => {
    setCursor(null);
    setHistory([]);
  };
  const patchFilters = (patch: Partial<AnalysisFilters>) => {
    onDefinitionChange({ ...definition, filters: { ...definition.filters, ...patch } });
    resetPagination();
  };
  const setDefinition = (nextDefinition: AnalysisQueryDefinition) => {
    onDefinitionChange(nextDefinition);
    resetPagination();
  };
  const exportFile = async (format: "csv" | "json") => {
    setExporting(format);
    try {
      await downloadAnalysis(treeId, branchId, definition, format);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "EXPORT_TOO_LARGE"
          ? t("analysis_export_too_large")
          : t("analysis_export_failed"),
      );
    } finally {
      setExporting(null);
    }
  };
  const page = query.data?.data;
  return (
    <div className="space-y-4">
      <AnalysisFilterPanel
        definition={definition}
        branches={branches}
        exporting={exporting}
        patchFilters={patchFilters}
        setDefinition={setDefinition}
        exportFile={(format) => void exportFile(format)}
      />
      <AnalysisMemberPage
        items={page?.items ?? []}
        total={page?.total ?? 0}
        nextCursor={page?.next_cursor ?? null}
        isLoading={query.isLoading}
        isError={query.isError}
        canGoBack={history.length > 0}
        goBack={() => {
          setCursor(history.at(-1) ?? null);
          setHistory((value) => value.slice(0, -1));
        }}
        goForward={() => {
          setHistory((value) => [...value, cursor]);
          setCursor(page?.next_cursor ?? null);
        }}
      />
    </div>
  );
}
