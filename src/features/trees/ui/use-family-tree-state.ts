import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useReactFlow } from "reactflow";
import { useFamily, useFamilyPersistence } from "../client/family-hooks";
import { familyStore } from "../client/family-store";
import {
  canvasCapabilities,
  isChronologicalPeriod,
  type ChronologicalPeriod,
  type TreePreviewType,
} from "../domain/canvas-preview";
import { useI18n } from "@/shared/i18n";
import type { MotherPickerState } from "./use-tree-edge-interactions";

export function useFamilyTreeState({
  chronologicalPeriod,
  previewType,
  readOnly,
}: {
  chronologicalPeriod: ChronologicalPeriod;
  previewType: TreePreviewType;
  readOnly: boolean;
}) {
  const members = useFamily();
  const persistence = useFamilyPersistence();
  const canEdit = !readOnly && familyStore.canEditActiveTree();
  const canManageSubfamilies = familyStore.canManageSubfamilies();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [collapsedByPreview, setCollapsedByPreview] = useState<
    Record<TreePreviewType, Set<string>>
  >({ lineage: new Set(), chronological: new Set() });
  const [query, setQuery] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedSubfamilyId, setSelectedSubfamilyId] = useState<string | null>(null);
  const [subfamilyFilterEnabled, setSubfamilyFilterEnabled] = useState(false);
  const [generationYear, setGenerationYear] = useState("");
  const [periodDraft, setPeriodDraft] = useState(String(chronologicalPeriod));
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [motherPicker, setMotherPicker] = useState<MotherPickerState | null>(null);
  const [collapsedWidgets, setCollapsedWidgets] = useState({
    preview: false,
    generation: false,
    subfamilies: false,
  });
  const flow = useReactFlow();
  const viewportRef = useRef(viewport);
  const refs = {
    canvasRef: useRef<HTMLDivElement>(null),
    didFit: useRef(false),
    previousChronologicalPeriod: useRef<ChronologicalPeriod>(chronologicalPeriod),
    previousPreviewType: useRef<TreePreviewType>(previewType),
    replacePositionsOnNextLayout: useRef(false),
    viewportRef,
    visibleNodePositions: useRef(new Map<string, { x: number; y: number }>()),
  };
  const capabilities = canvasCapabilities(canEdit, previewType);
  usePeriodNavigation({ chronologicalPeriod, navigate, periodDraft, previewType, setPeriodDraft });
  usePersistenceNotice(persistence.error, readOnly);
  return {
    core: { canEdit, canManageSubfamilies, capabilities, lang, members, navigate, t },
    flow,
    refs,
    selection: {
      collapsedByPreview,
      highlightId,
      selectedSubfamilyId,
      setCollapsedByPreview,
      setHighlightId,
      setSelectedSubfamilyId,
      setSubfamilyFilterEnabled,
      subfamilyFilterEnabled,
    },
    ui: {
      collapsedWidgets,
      generationYear,
      motherPicker,
      periodDraft,
      query,
      setCollapsedWidgets,
      setGenerationYear,
      setMotherPicker,
      setPeriodDraft,
      setQuery,
      setViewport,
      viewport,
    },
  };
}

export type FamilyTreeState = ReturnType<typeof useFamilyTreeState>;

function usePeriodNavigation({
  chronologicalPeriod,
  navigate,
  periodDraft,
  previewType,
  setPeriodDraft,
}: {
  chronologicalPeriod: ChronologicalPeriod;
  navigate: ReturnType<typeof useNavigate>;
  periodDraft: string;
  previewType: TreePreviewType;
  setPeriodDraft: (value: string) => void;
}) {
  useEffect(
    () => setPeriodDraft(String(chronologicalPeriod)),
    [chronologicalPeriod, setPeriodDraft],
  );
  useEffect(() => {
    if (previewType !== "chronological") return;
    const value = Number(periodDraft);
    if (!isChronologicalPeriod(value) || value === chronologicalPeriod) return;
    const timeout = window.setTimeout(() => {
      void navigate({
        to: "/tree/$id",
        params: { id: familyStore.getActiveTreeId() },
        search: { mode: "preview", preview: "chronological", period: value },
        replace: true,
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [chronologicalPeriod, navigate, periodDraft, previewType]);
}

function usePersistenceNotice(error: string | null, readOnly: boolean) {
  useEffect(() => {
    if (readOnly || !error) return;
    const conflict = error === "VERSION_CONFLICT";
    toast.error(
      conflict ? "This tree changed in another session." : "Unable to save tree changes.",
      {
        id: "tree-persistence-error",
        duration: Infinity,
        action: conflict
          ? { label: "Reload latest", onClick: () => familyStore.reloadAfterConflict() }
          : undefined,
      },
    );
  }, [error, readOnly]);
}
