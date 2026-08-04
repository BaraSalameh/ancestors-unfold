import { Download, Search, X } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { clearAnalysisFilters, hasActiveAnalysisFilters } from "../domain/filter-state";
import type { AnalysisBranch, AnalysisFilters, AnalysisQueryDefinition } from "../domain/types";
import { AnalysisAdvancedFilters } from "./analysis-advanced-filters";

const inputClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

type AnalysisFilterPanelProps = {
  definition: AnalysisQueryDefinition;
  branches: AnalysisBranch[];
  exporting: "csv" | "json" | null;
  patchFilters: (patch: Partial<AnalysisFilters>) => void;
  setDefinition: (definition: AnalysisQueryDefinition) => void;
  exportFile: (format: "csv" | "json") => void;
};

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function FilterHeader({
  definition,
  setDefinition,
}: Pick<AnalysisFilterPanelProps, "definition" | "setDefinition">) {
  const { t } = useI18n();
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-3">
      <CardTitle>{t("analysis_filters")}</CardTitle>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!hasActiveAnalysisFilters(definition.filters)}
        onClick={() => setDefinition(clearAnalysisFilters(definition))}
      >
        <X className="h-4 w-4" />
        {t("analysis_clear_filters")}
      </Button>
    </CardHeader>
  );
}

export function AnalysisFilterPanel({
  definition,
  branches,
  exporting,
  patchFilters,
  setDefinition,
  exportFile,
}: AnalysisFilterPanelProps) {
  const { t } = useI18n();
  const setSingle = (value: string, key: "genders" | "citizenStatuses") =>
    patchFilters({ [key]: value ? [value] : undefined } as Partial<AnalysisFilters>);
  return (
    <Card>
      <FilterHeader definition={definition} setDefinition={setDefinition} />
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="analysis-search">{t("analysis_search")}</Label>
          <div className="relative">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="analysis-search"
              className="ps-9"
              value={definition.filters.search ?? ""}
              onChange={(event) => patchFilters({ search: event.target.value || undefined })}
            />
          </div>
        </div>
        <SelectFilter
          id="analysis-gender"
          label={t("gender")}
          value={definition.filters.genders?.[0] ?? ""}
          onChange={(value) => setSingle(value, "genders")}
          options={[
            ["", t("analysis_all")],
            ["male", t("male")],
            ["female", t("female")],
          ]}
        />
        <SelectFilter
          id="analysis-life"
          label={t("analysis_life_status")}
          value={definition.filters.lifeStatus ?? ""}
          onChange={(value) =>
            patchFilters({ lifeStatus: (value || undefined) as AnalysisFilters["lifeStatus"] })
          }
          options={[
            ["", t("analysis_all")],
            ["living", t("living")],
            ["deceased", t("deceased")],
          ]}
        />
        <SelectFilter
          id="analysis-citizen"
          label={t("citizenship_status")}
          value={definition.filters.citizenStatuses?.[0] ?? ""}
          onChange={(value) => setSingle(value, "citizenStatuses")}
          options={[
            ["", t("analysis_all")],
            ["resident", t("resident")],
            ["non_resident", t("non_resident")],
          ]}
        />
        <NumberFilter
          id="analysis-min-age"
          label={t("analysis_min_age")}
          value={definition.filters.minAge}
          onChange={(value) => patchFilters({ minAge: value })}
        />
        <NumberFilter
          id="analysis-max-age"
          label={t("analysis_max_age")}
          value={definition.filters.maxAge}
          onChange={(value) => patchFilters({ maxAge: value })}
        />
        <SelectFilter
          id="analysis-parents"
          label={t("analysis_recorded_parents")}
          value={definition.filters.parentCount?.toString() ?? ""}
          onChange={(value) =>
            patchFilters({ parentCount: value === "" ? undefined : (Number(value) as 0 | 1 | 2) })
          }
          options={[
            ["", t("analysis_all")],
            ["0", "0"],
            ["1", "1"],
            ["2", "2"],
          ]}
        />
        <MissingFieldFilter
          value={definition.filters.missingFields?.[0] ?? ""}
          onChange={patchFilters}
        />
        <SortFilter definition={definition} setDefinition={setDefinition} />
        <AnalysisAdvancedFilters
          branches={branches}
          definition={definition}
          patchFilters={patchFilters}
          setDefinition={setDefinition}
        />
        <div className="flex items-end gap-2">
          {(["csv", "json"] as const).map((format) => (
            <Button
              key={format}
              variant="outline"
              loading={exporting === format}
              onClick={() => exportFile(format)}
            >
              <Download className="h-4 w-4" />
              {format.toUpperCase()}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SelectFilter({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function NumberFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={200}
        value={value ?? ""}
        onChange={(event) => onChange(optionalNumber(event.target.value))}
      />
    </div>
  );
}

function MissingFieldFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (patch: Partial<AnalysisFilters>) => void;
}) {
  const { t } = useI18n();
  const options: Array<[string, string]> = [
    ["", t("analysis_none")],
    ["name_en", t("analysis_missing_name_en")],
    ["name_ar", t("analysis_missing_name_ar")],
    ["birth_date", t("analysis_missing_birth")],
    ["branch", t("analysis_missing_branch")],
    ["image", t("analysis_missing_image")],
    ["parent", t("analysis_no_parents_recorded")],
  ];
  return (
    <SelectFilter
      id="analysis-missing"
      label={t("analysis_missing_field")}
      value={value}
      onChange={(nextValue) =>
        onChange({
          missingFields: nextValue
            ? [nextValue as NonNullable<AnalysisFilters["missingFields"]>[number]]
            : undefined,
        })
      }
      options={options}
    />
  );
}

function SortFilter({
  definition,
  setDefinition,
}: {
  definition: AnalysisQueryDefinition;
  setDefinition: (definition: AnalysisQueryDefinition) => void;
}) {
  const { t } = useI18n();
  return (
    <SelectFilter
      id="analysis-sort"
      label={t("analysis_sort")}
      value={definition.sort}
      onChange={(sort) =>
        setDefinition({ ...definition, sort: sort as AnalysisQueryDefinition["sort"] })
      }
      options={[
        ["name", t("name_english")],
        ["age", t("analysis_age")],
        ["birth_date", t("birth_date")],
        ["children", t("children")],
        ["generation", t("analysis_generation")],
        ["created_at", t("analysis_created")],
      ]}
    />
  );
}
