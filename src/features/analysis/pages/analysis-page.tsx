import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ChartNoAxesCombined } from "lucide-react";
import { useState } from "react";
import { useI18n, type Lang } from "@/shared/i18n";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  getAnalysisCatalog,
  getAnalysisSummary,
  getAnalysisTree,
  type AnalysisCatalog,
  type AnalysisTree,
} from "../client/analysis-api";
import { AnalysisExplorer } from "../components/analysis-explorer";
import { AnalysisExcludeWivesControl } from "../components/analysis-exclude-wives-control";
import { AnalysisReport } from "../components/analysis-reports";
import { AnalysisSavedViews } from "../components/analysis-saved-views";
import { AnalysisSummary } from "../components/analysis-summary";
import type { AnalysisEnvelope, AnalysisQueryDefinition, SummaryData } from "../domain/types";
import {
  analysisExcludeWivesDisabled,
  analysisPageState,
  analysisTabs,
  type AnalysisTab,
} from "../domain/analysis-page-search";
import { withExcludeWives } from "../domain/filter-state";

const selectClass = "h-10 min-w-56 rounded-md border bg-background px-3 text-sm";

function AnalysisLoading() {
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-6">
      <Skeleton className="h-24" />
      <Skeleton className="h-96" />
    </main>
  );
}

function AnalysisMessage({ unavailable = false }: { unavailable?: boolean }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Alert variant={unavailable ? "default" : "destructive"}>
        <h2 className="mb-1 font-medium">
          {t(unavailable ? "analysis_unavailable" : "analysis_load_failed")}
        </h2>
        <AlertDescription>
          {unavailable ? t("analysis_unavailable_desc") : null}
          {!unavailable ? (
            <Button asChild variant="outline" className="mt-3">
              <Link to="/">{t("back")}</Link>
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    </main>
  );
}

function localizedName(lang: Lang, en: string | null, ar: string | null) {
  return lang === "ar" ? ar || en || "" : en || ar || "";
}

function ScopeControl({
  catalog,
  branchId,
  onBranchChange,
}: {
  catalog: AnalysisCatalog | undefined;
  branchId: string | null;
  onBranchChange: (branchId: string | null) => void;
}) {
  const { t, lang } = useI18n();
  return (
    <label className="space-y-1 text-sm">
      <span className="block text-muted-foreground">{t("analysis_scope")}</span>
      <select
        className={selectClass}
        value={branchId ?? ""}
        onChange={(event) => onBranchChange(event.target.value || null)}
      >
        <option value="">{t("analysis_whole_tree")}</option>
        {(catalog?.branches ?? []).map((branch) => (
          <option key={branch.id} value={branch.id}>
            {localizedName(lang, branch.name_en, branch.name_ar)}
          </option>
        ))}
      </select>
    </label>
  );
}

function AnalysisHeader(props: {
  tree: AnalysisTree;
  catalog: AnalysisCatalog | undefined;
  summary: AnalysisEnvelope<SummaryData> | undefined;
  branchId: string | null;
  onBranchChange: (branchId: string | null) => void;
}) {
  const { t, lang } = useI18n();
  return (
    <section className="border-b bg-card">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="mb-3 -ms-3">
          <Link to="/">
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
            {t("back")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <ChartNoAxesCombined className="h-5 w-5" />
              <span className="text-sm font-semibold">{t("analysis")}</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold">
              {localizedName(lang, props.tree.name_en, props.tree.name_ar)}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("analysis_intro")}</p>
          </div>
          <ScopeControl
            catalog={props.catalog}
            branchId={props.branchId}
            onBranchChange={props.onBranchChange}
          />
        </div>
        {props.summary ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {t("analysis_as_of", { date: props.summary.as_of_date })} ·{" "}
            {t("analysis_unknowns_note")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

const analysisTabLabels = [
  ["overview", "analysis_overview"],
  ["branches", "analysis_branches"],
  ["relationships", "analysis_relationships"],
  ["quality", "analysis_quality"],
  ["explorer", "analysis_explorer"],
  ["saved", "analysis_saved_views"],
] as const;

function AnalysisContent({
  treeId,
  branchId,
  summary,
  branches,
  definition,
  activeTab,
  onDefinitionChange,
  onTabChange,
  onExcludeWivesChange,
}: {
  treeId: string;
  branchId: string | null;
  summary: AnalysisEnvelope<SummaryData> | undefined;
  branches: AnalysisCatalog["branches"];
  definition: AnalysisQueryDefinition;
  activeTab: AnalysisTab;
  onDefinitionChange: (definition: AnalysisQueryDefinition) => void;
  onTabChange: (tab: AnalysisTab) => void;
  onExcludeWivesChange: (checked: boolean) => void;
}) {
  const { t } = useI18n();
  const excludesWivesDisabled = analysisExcludeWivesDisabled(activeTab);
  return (
    <section className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as AnalysisTab)}>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="h-auto min-w-0 justify-start overflow-x-auto p-1">
            {analysisTabLabels.map(([value, key]) => (
              <TabsTrigger key={value} value={value}>
                {t(key)}
              </TabsTrigger>
            ))}
          </TabsList>
          <AnalysisExcludeWivesControl
            checked={!excludesWivesDisabled && definition.filters.excludeWives === true}
            disabled={excludesWivesDisabled}
            onChange={onExcludeWivesChange}
          />
        </div>
        <TabsContent value="overview">
          {summary ? <AnalysisSummary summary={summary.data} /> : <Skeleton className="h-96" />}
        </TabsContent>
        <TabsContent value="branches">
          <p className="mb-4 text-sm text-muted-foreground">{t("analysis_branch_overlap_note")}</p>
          <AnalysisReport
            treeId={treeId}
            branchId={branchId}
            report="branches"
            excludeWives={definition.filters.excludeWives === true}
          />
        </TabsContent>
        <TabsContent value="relationships">
          <p className="mb-4 text-sm text-muted-foreground">
            {t("analysis_recorded_relationships_note")}
          </p>
          <AnalysisReport treeId={treeId} branchId={branchId} report="relationships" />
        </TabsContent>
        <TabsContent value="quality">
          <AnalysisReport treeId={treeId} branchId={branchId} report="quality" />
        </TabsContent>
        <TabsContent value="explorer">
          <AnalysisExplorer
            treeId={treeId}
            branchId={branchId}
            branches={branches}
            definition={definition}
            onDefinitionChange={onDefinitionChange}
          />
        </TabsContent>
        <TabsContent value="saved">
          <AnalysisSavedViews
            treeId={treeId}
            definition={definition}
            onApply={(nextDefinition) => {
              onDefinitionChange(nextDefinition);
              onTabChange(nextDefinition.view ?? "explorer");
            }}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function AnalysisPageContent({ initial }: { initial: ReturnType<typeof analysisPageState> }) {
  const [branchId, setBranchId] = useState<string | null>(initial.branchId);
  const [activeTab, setActiveTab] = useState<(typeof analysisTabs)[number]>(initial.tab);
  const [definition, setDefinition] = useState<AnalysisQueryDefinition>(initial.definition);
  const tree = useQuery({
    queryKey: ["analysis-tree"],
    queryFn: ({ signal }) => getAnalysisTree(signal),
    staleTime: 60_000,
  });
  const treeId = tree.data?.id;
  const enabled = Boolean(treeId && tree.data?.analysis_enabled);
  const excludeWives = definition.filters.excludeWives === true;
  const catalog = useQuery({
    queryKey: ["analysis-catalog", treeId],
    queryFn: ({ signal }) => getAnalysisCatalog(treeId!, signal),
    enabled,
    staleTime: 60_000,
  });
  const summary = useQuery({
    queryKey: ["analysis-summary", treeId, branchId, excludeWives],
    queryFn: ({ signal }) => getAnalysisSummary(treeId!, branchId, excludeWives, signal),
    enabled,
    staleTime: 60_000,
  });
  if (tree.isLoading) return <AnalysisLoading />;
  if (!tree.data?.analysis_enabled) return <AnalysisMessage unavailable />;
  if (!treeId || tree.isError || catalog.isError || summary.isError) return <AnalysisMessage />;
  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-muted/25">
      <AnalysisHeader
        tree={tree.data}
        catalog={catalog.data?.data}
        summary={summary.data}
        branchId={branchId}
        onBranchChange={setBranchId}
      />
      <AnalysisContent
        treeId={treeId}
        branchId={branchId}
        summary={summary.data}
        branches={catalog.data?.data.branches ?? []}
        definition={definition}
        activeTab={activeTab}
        onDefinitionChange={setDefinition}
        onTabChange={setActiveTab}
        onExcludeWivesChange={(checked) =>
          setDefinition((current) => withExcludeWives(current, checked))
        }
      />
    </main>
  );
}

export function AnalysisPage() {
  const search = useSearch({ from: "/analysis" });
  const initial = analysisPageState(search);
  const stateKey = `${initial.tab}:${initial.branchId ?? "tree"}:${search.missingField ?? "all"}`;
  return <AnalysisPageContent key={stateKey} initial={initial} />;
}
