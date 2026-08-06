import { CalendarRange, ChevronDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import type { Dispatch, SetStateAction } from "react";
import { SubfamilyPanel } from "@/features/subfamilies";
import type { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { familyStore } from "../client/family-store";
import {
  MAX_CHRONOLOGICAL_PERIOD,
  MIN_CHRONOLOGICAL_PERIOD,
  isChronologicalPeriod,
  type ChronologicalPeriod,
  type TreePreviewType,
} from "../domain/canvas-preview";

type I18n = ReturnType<typeof useI18n>;
export interface CollapsedTreeWidgets {
  preview: boolean;
  generation: boolean;
  subfamilies: boolean;
}

interface GenerationBand {
  start: number;
  end: number;
}

export interface FamilyTreeSidebarProps {
  activeGeneration?: GenerationBand;
  canManageSubfamilies: boolean;
  chronologicalPeriod: ChronologicalPeriod;
  collapsedWidgets: CollapsedTreeWidgets;
  generationYear: string;
  generations: GenerationBand[];
  overviewMode: boolean;
  periodDraft: string;
  previewType: TreePreviewType;
  scrollToGeneration: () => void;
  selectedSubfamilyId: string | null;
  setGenerationYear: (year: string) => void;
  setPeriodDraft: (period: string) => void;
  setSelectedSubfamilyId: (id: string | null) => void;
  setSubfamilyFilterEnabled: Dispatch<SetStateAction<boolean>>;
  subfamilyFilterEnabled: boolean;
  t: I18n["t"];
  toggleWidget: (widget: keyof CollapsedTreeWidgets) => void;
}

export function FamilyTreeSidebar(props: FamilyTreeSidebarProps) {
  const hasWidgets =
    props.overviewMode || props.previewType === "chronological" || props.canManageSubfamilies;
  if (!hasWidgets) return null;
  return (
    <div className="flex min-h-0 w-72 max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto">
      {props.overviewMode && <PreviewWidget {...props} />}
      {props.previewType === "chronological" && <GenerationWidget {...props} />}
      {props.canManageSubfamilies ? <SubfamiliesWidget {...props} /> : null}
    </div>
  );
}

function WidgetHeader({
  collapsed,
  icon,
  label,
  onClick,
}: {
  collapsed: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between font-semibold ${collapsed ? "" : "mb-2"}`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
    </button>
  );
}

function PreviewWidget(props: FamilyTreeSidebarProps) {
  const navigate = useNavigate();
  const selectPreview = (preview: TreePreviewType) =>
    navigate({
      to: "/tree/$id",
      params: { id: familyStore.getActiveTreeId() },
      search: { mode: "preview", preview, period: props.chronologicalPeriod },
    });
  return (
    <div className="rounded-xl border border-border/80 bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
      <WidgetHeader
        collapsed={props.collapsedWidgets.preview}
        label={props.t("preview_type")}
        onClick={() => props.toggleWidget("preview")}
      />
      {!props.collapsedWidgets.preview && (
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1">
          <PreviewButton
            active={props.previewType === "lineage"}
            label={props.t("lineage_view")}
            onClick={() => selectPreview("lineage")}
          />
          <PreviewButton
            active={props.previewType === "chronological"}
            label={props.t("generation_view")}
            onClick={() => selectPreview("chronological")}
          />
        </div>
      )}
    </div>
  );
}

function PreviewButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className={`rounded px-2 py-1.5 ${props.active ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
    >
      {props.label}
    </button>
  );
}

function GenerationWidget(props: FamilyTreeSidebarProps) {
  const invalid = props.periodDraft.length > 0 && !isChronologicalPeriod(Number(props.periodDraft));
  return (
    <div className="rounded-xl border border-border/80 bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
      <WidgetHeader
        collapsed={props.collapsedWidgets.generation}
        icon={<CalendarRange className="h-4 w-4 text-primary" />}
        label={props.t("generation")}
        onClick={() => props.toggleWidget("generation")}
      />
      {!props.collapsedWidgets.generation && (
        <>
          <label className="mb-1 block text-[10px] text-muted-foreground">
            {props.t("period_length")}
          </label>
          <Input
            value={props.periodDraft}
            onChange={(event) => props.setPeriodDraft(event.target.value)}
            inputMode="numeric"
            type="text"
            placeholder={props.t("period_placeholder")}
            aria-invalid={invalid}
            className="h-8 text-xs"
          />
          <p
            className={`mb-2 mt-1 text-[10px] ${invalid ? "text-destructive" : "text-muted-foreground"}`}
          >
            {invalid
              ? props.t("period_invalid")
              : props.t("period_range", {
                  min: MIN_CHRONOLOGICAL_PERIOD,
                  max: MAX_CHRONOLOGICAL_PERIOD,
                })}
          </p>
          <div className="flex gap-1">
            <Input
              value={props.generationYear}
              onChange={(event) =>
                props.setGenerationYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))
              }
              onKeyDown={(event) => event.key === "Enter" && props.scrollToGeneration()}
              inputMode="numeric"
              placeholder={props.t("generation_year_placeholder")}
              className="h-8 text-xs"
              disabled={props.generations.length === 0}
            />
            <Button
              size="sm"
              onClick={props.scrollToGeneration}
              disabled={props.generations.length === 0 || props.generationYear.length !== 4}
            >
              {props.t("go")}
            </Button>
          </div>
          {props.activeGeneration && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              {props.activeGeneration.start}
              {"\u2013"}
              {props.activeGeneration.end}
            </div>
          )}
          {props.generations.length === 0 && (
            <p className="mt-2 text-muted-foreground">{props.t("no_generation_data")}</p>
          )}
        </>
      )}
    </div>
  );
}

function SubfamiliesWidget(props: FamilyTreeSidebarProps) {
  return (
    <div className="rounded-xl border border-border/80 bg-card/95 p-3 text-xs shadow-lg backdrop-blur">
      <WidgetHeader
        collapsed={props.collapsedWidgets.subfamilies}
        label={props.t("subfamilies")}
        onClick={() => props.toggleWidget("subfamilies")}
      />
      {!props.collapsedWidgets.subfamilies && (
        <div className="max-h-[35vh] overflow-y-auto overscroll-contain pr-1">
          <SubfamilyPanel
            mode="home"
            readOnly
            selectedSubfamilyId={props.selectedSubfamilyId}
            onSelectSubfamily={props.setSelectedSubfamilyId}
            filterEnabled={props.subfamilyFilterEnabled}
            onToggleFilter={props.setSubfamilyFilterEnabled}
            hideHeading
          />
        </div>
      )}
    </div>
  );
}
