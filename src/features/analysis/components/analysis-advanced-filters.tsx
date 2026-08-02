import { useI18n } from "@/shared/i18n";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { AnalysisBranch, AnalysisFilters, AnalysisQueryDefinition } from "../domain/types";

const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";

type Props = {
  branches: AnalysisBranch[];
  definition: AnalysisQueryDefinition;
  patchFilters: (patch: Partial<AnalysisFilters>) => void;
  setDefinition: (definition: AnalysisQueryDefinition) => void;
};

const optionalNumber = (value: string) => (value === "" ? undefined : Number(value));
const optionalDateTime = (value: string) =>
  value === "" ? undefined : new Date(value).toISOString();
const localDateTime = (value?: string) => value?.slice(0, 16) ?? "";

function FilterInput({
  id,
  label,
  type,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type: "date" | "datetime-local" | "number";
  value: string | number | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        min={type === "number" ? 0 : undefined}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function BooleanFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectClass}
        value={value === undefined ? "" : String(value)}
        onChange={(event) =>
          onChange(event.target.value === "" ? undefined : event.target.value === "true")
        }
      >
        <option value="">{t("analysis_all")}</option>
        <option value="true">{t("analysis_yes")}</option>
        <option value="false">{t("analysis_no")}</option>
      </select>
    </div>
  );
}

function LifecycleDateFilters({
  filters,
  patchFilters,
}: {
  filters: AnalysisFilters;
  patchFilters: Props["patchFilters"];
}) {
  const { t } = useI18n();
  return (
    <>
      <FilterInput
        id="analysis-birth-from"
        label={t("analysis_birth_from")}
        type="date"
        value={filters.birthFrom}
        onChange={(value) => patchFilters({ birthFrom: value || undefined })}
      />
      <FilterInput
        id="analysis-birth-to"
        label={t("analysis_birth_to")}
        type="date"
        value={filters.birthTo}
        onChange={(value) => patchFilters({ birthTo: value || undefined })}
      />
      <FilterInput
        id="analysis-death-from"
        label={t("analysis_death_from")}
        type="date"
        value={filters.deathFrom}
        onChange={(value) => patchFilters({ deathFrom: value || undefined })}
      />
      <FilterInput
        id="analysis-death-to"
        label={t("analysis_death_to")}
        type="date"
        value={filters.deathTo}
        onChange={(value) => patchFilters({ deathTo: value || undefined })}
      />
    </>
  );
}

function DirectionFilter({
  definition,
  setDefinition,
}: Pick<Props, "definition" | "setDefinition">) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      <Label htmlFor="analysis-direction">{t("analysis_direction")}</Label>
      <select
        id="analysis-direction"
        className={selectClass}
        value={definition.direction}
        onChange={(event) =>
          setDefinition({ ...definition, direction: event.target.value as "asc" | "desc" })
        }
      >
        <option value="asc">{t("analysis_ascending")}</option>
        <option value="desc">{t("analysis_descending")}</option>
      </select>
    </div>
  );
}

export function AnalysisAdvancedFilters({
  branches,
  definition,
  patchFilters,
  setDefinition,
}: Props) {
  const { t, lang } = useI18n();
  const filters = definition.filters;
  return (
    <details className="sm:col-span-2 lg:col-span-4">
      <summary className="cursor-pointer py-2 text-sm font-medium">
        {t("analysis_advanced_filters")}
      </summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="analysis-branch">{t("select_branch")}</Label>
          <select
            id="analysis-branch"
            className={selectClass}
            value={filters.branchIds?.[0] ?? ""}
            onChange={(event) =>
              patchFilters({ branchIds: event.target.value ? [event.target.value] : undefined })
            }
          >
            <option value="">{t("analysis_all")}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {lang === "ar"
                  ? branch.name_ar || branch.name_en
                  : branch.name_en || branch.name_ar}
              </option>
            ))}
          </select>
        </div>
        <LifecycleDateFilters filters={filters} patchFilters={patchFilters} />
        <BooleanFilter
          id="analysis-spouse"
          label={t("analysis_recorded_spouse")}
          value={filters.hasSpouse}
          onChange={(value) => patchFilters({ hasSpouse: value })}
        />
        <BooleanFilter
          id="analysis-children"
          label={t("analysis_recorded_children")}
          value={filters.hasChildren}
          onChange={(value) => patchFilters({ hasChildren: value })}
        />
        <FilterInput
          id="analysis-min-children"
          label={t("analysis_min_children")}
          type="number"
          value={filters.minChildren}
          onChange={(value) => patchFilters({ minChildren: optionalNumber(value) })}
        />
        <FilterInput
          id="analysis-max-children"
          label={t("analysis_max_children")}
          type="number"
          value={filters.maxChildren}
          onChange={(value) => patchFilters({ maxChildren: optionalNumber(value) })}
        />
        <FilterInput
          id="analysis-min-generation"
          label={t("analysis_min_generation")}
          type="number"
          value={filters.minGeneration}
          onChange={(value) => patchFilters({ minGeneration: optionalNumber(value) })}
        />
        <FilterInput
          id="analysis-max-generation"
          label={t("analysis_max_generation")}
          type="number"
          value={filters.maxGeneration}
          onChange={(value) => patchFilters({ maxGeneration: optionalNumber(value) })}
        />
        <FilterInput
          id="analysis-created-from"
          label={t("analysis_created_from")}
          type="datetime-local"
          value={localDateTime(filters.createdFrom)}
          onChange={(value) => patchFilters({ createdFrom: optionalDateTime(value) })}
        />
        <FilterInput
          id="analysis-created-to"
          label={t("analysis_created_to")}
          type="datetime-local"
          value={localDateTime(filters.createdTo)}
          onChange={(value) => patchFilters({ createdTo: optionalDateTime(value) })}
        />
        <FilterInput
          id="analysis-updated-from"
          label={t("analysis_updated_from")}
          type="datetime-local"
          value={localDateTime(filters.updatedFrom)}
          onChange={(value) => patchFilters({ updatedFrom: optionalDateTime(value) })}
        />
        <FilterInput
          id="analysis-updated-to"
          label={t("analysis_updated_to")}
          type="datetime-local"
          value={localDateTime(filters.updatedTo)}
          onChange={(value) => patchFilters({ updatedTo: optionalDateTime(value) })}
        />
        <DirectionFilter definition={definition} setDefinition={setDefinition} />
      </div>
    </details>
  );
}
