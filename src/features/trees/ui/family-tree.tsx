import "reactflow/dist/style.css";
import { ReactFlowProvider } from "reactflow";
import type { TreeAccessMode } from "../domain/access-policy";
import {
  DEFAULT_CHRONOLOGICAL_PERIOD,
  type ChronologicalPeriod,
  type TreePreviewType,
} from "../domain/canvas-preview";
import { FamilyTreeComposition } from "./family-tree-composition";
import { useFamilyTreeInteractions } from "./use-family-tree-interactions";
import { useFamilyTreeProjection } from "./use-family-tree-projection";
import { useFamilyTreeState } from "./use-family-tree-state";

interface FamilyTreeProps {
  accessMode?: TreeAccessMode;
  initialBranchId?: string;
  chronologicalPeriod?: ChronologicalPeriod;
  overviewMode?: boolean;
  preview?: TreePreviewType;
  readOnly?: boolean;
}

function Inner({
  readOnly = false,
  overviewMode = false,
  preview = "lineage",
  chronologicalPeriod = DEFAULT_CHRONOLOGICAL_PERIOD,
  accessMode = "edit",
  initialBranchId,
}: FamilyTreeProps) {
  const state = useFamilyTreeState({
    chronologicalPeriod,
    initialBranchId,
    previewType: preview,
    readOnly,
  });
  const projection = useFamilyTreeProjection({
    accessMode,
    chronologicalPeriod,
    previewType: preview,
    state,
  });
  const interactions = useFamilyTreeInteractions({
    chronologicalPeriod,
    previewType: preview,
    projection,
    state,
  });
  return (
    <FamilyTreeComposition
      chronologicalPeriod={chronologicalPeriod}
      interactions={interactions}
      overviewMode={overviewMode}
      previewType={preview}
      projection={projection}
      state={state}
    />
  );
}

export function FamilyTree(props: FamilyTreeProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
