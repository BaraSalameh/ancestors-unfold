import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ApiClientError } from "@/shared/api/client";
import { useI18n } from "@/shared/i18n";
import { treeClient, type FamilyCsvPreviewResponse } from "../api/tree-client";
import { familyStore } from "../client/family-store";
import { useFamilyPersistence } from "../client/family-hooks";
import { FAMILY_CSV_MAX_BYTES, type FamilyCsvIssue } from "../domain/family-csv-import";

export type FamilyCsvMappingState = {
  linkedMembers: Record<string, string>;
  grantedBranches: Record<string, string>;
};

const emptyMappings = (): FamilyCsvMappingState => ({ linkedMembers: {}, grantedBranches: {} });
const issueSchema = z.object({
  code: z.string(),
  message: z.string(),
  row: z.number().optional(),
  column: z.string().optional(),
  severity: z.enum(["error", "warning"]),
});

function responseIssues(error: unknown): FamilyCsvIssue[] {
  if (!(error instanceof ApiClientError)) return [];
  const parsed = z.object({ issues: z.array(issueSchema) }).safeParse(error.payload);
  return parsed.success ? parsed.data.issues : [];
}

function mappingsAreValid(
  preview: FamilyCsvPreviewResponse | undefined,
  mappings: FamilyCsvMappingState,
) {
  if (!preview) return false;
  const memberValues = Object.values(mappings.linkedMembers).filter(Boolean);
  const branchValues = Object.values(mappings.grantedBranches).filter(Boolean);
  const membersValid = preview.mappingRequirements.linkedMembers.every((requirement) => {
    const selected = mappings.linkedMembers[requirement.target_member_id];
    return (
      !selected ||
      preview.members.some(
        (member) => member.id === selected && member.gender === requirement.gender,
      )
    );
  });
  const branchesValid = preview.mappingRequirements.grantedBranches.every((requirement) => {
    const selected = mappings.grantedBranches[requirement.target_branch_id];
    return !selected || preview.subfamilies.some((branch) => branch.id === selected);
  });
  return (
    membersValid &&
    branchesValid &&
    new Set(memberValues).size === memberValues.length &&
    new Set(branchValues).size === branchValues.length
  );
}

export function useFamilyCsvImport(onOpenChange: (open: boolean) => void) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<FamilyCsvPreviewResponse>();
  const [issues, setIssues] = useState<FamilyCsvIssue[]>([]);
  const [mappings, setMappings] = useState<FamilyCsvMappingState>(emptyMappings);
  const { dirty } = useFamilyPersistence();
  const reset = () => {
    setFileName("");
    setPreview(undefined);
    setIssues([]);
    setMappings(emptyMappings());
    if (inputRef.current) inputRef.current.value = "";
  };
  const changeOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };
  const selectFile = async (file: File | undefined) => {
    if (!file || dirty) return;
    setFileName(file.name);
    setPreview(undefined);
    if (file.size > FAMILY_CSV_MAX_BYTES) {
      setIssues([
        { code: "FILE_TOO_LARGE", message: t("family_csv_file_too_large"), severity: "error" },
      ]);
      return;
    }
    setLoading(true);
    setIssues([]);
    try {
      setPreview(
        await treeClient.previewFamilyCsv(familyStore.getActiveTreeId(), await file.text()),
      );
      setMappings(emptyMappings());
    } catch (error) {
      const validation = responseIssues(error);
      setIssues(
        validation.length
          ? validation
          : [
              {
                code: error instanceof ApiClientError ? error.code : "REQUEST_FAILED",
                message: t("family_csv_preview_failed"),
                severity: "error",
              },
            ],
      );
    } finally {
      setLoading(false);
    }
  };
  const mappingComplete = useMemo(() => mappingsAreValid(preview, mappings), [mappings, preview]);
  const loadDraft = () => {
    if (!preview || !mappingComplete) return;
    try {
      familyStore.stageFamilyCsvImport(preview, mappings);
      toast.success(t("family_csv_draft_loaded"));
      changeOpen(false);
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.code === "VERSION_CONFLICT"
          ? t("tree_version_conflict")
          : t("family_csv_mapping_invalid");
      toast.error(message);
    }
  };
  return {
    inputRef,
    loading,
    fileName,
    preview,
    issues,
    mappings,
    setMappings,
    dirty,
    mappingComplete,
    changeOpen,
    selectFile,
    loadDraft,
  };
}
