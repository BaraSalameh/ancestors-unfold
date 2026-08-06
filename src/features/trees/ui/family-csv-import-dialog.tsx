import { useMemo, useRef, useState } from "react";
import { Download, FileWarning, Upload } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError } from "@/shared/api/client";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { treeClient, type FamilyCsvPreviewResponse } from "../api/tree-client";
import { familyStore } from "../client/family-store";
import {
  familyCsvTemplate,
  FAMILY_CSV_MAX_BYTES,
  type FamilyCsvIssue,
} from "../domain/family-csv-import";

type MappingState = {
  linkedMembers: Record<string, string>;
  grantedBranches: Record<string, string>;
};

// The wizard keeps file, preview, mapping, and draft-loading state within one modal lifecycle.
// eslint-disable-next-line max-lines-per-function
export function FamilyCsvImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<FamilyCsvPreviewResponse>();
  const [issues, setIssues] = useState<FamilyCsvIssue[]>([]);
  const [mappings, setMappings] = useState<MappingState>({
    linkedMembers: {},
    grantedBranches: {},
  });
  const dirty = familyStore.getPersistenceState().dirty;

  const reset = () => {
    setFileName("");
    setPreview(undefined);
    setIssues([]);
    setMappings({ linkedMembers: {}, grantedBranches: {} });
    if (inputRef.current) inputRef.current.value = "";
  };
  const changeOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const selectFile = async (file: File | undefined) => {
    if (!file || dirty) return;
    if (file.size > FAMILY_CSV_MAX_BYTES) {
      setFileName(file.name);
      setPreview(undefined);
      setIssues([
        {
          code: "FILE_TOO_LARGE",
          message: t("family_csv_file_too_large"),
          severity: "error",
        },
      ]);
      return;
    }
    setLoading(true);
    setFileName(file.name);
    setIssues([]);
    setPreview(undefined);
    try {
      const response = await treeClient.previewFamilyCsv(
        familyStore.getActiveTreeId(),
        await file.text(),
      );
      setPreview(response);
      setMappings({ linkedMembers: {}, grantedBranches: {} });
    } catch (caught) {
      const payload = caught instanceof ApiClientError ? caught.payload : undefined;
      const responseIssues = validationIssues(payload);
      setIssues(
        responseIssues.length
          ? responseIssues
          : [
              {
                code: caught instanceof ApiClientError ? caught.code : "REQUEST_FAILED",
                message: t("family_csv_preview_failed"),
                severity: "error",
              },
            ],
      );
    } finally {
      setLoading(false);
    }
  };

  const mappingComplete = useMemo(() => {
    if (!preview) return false;
    const memberValues = Object.values(mappings.linkedMembers).filter(Boolean);
    const branchValues = Object.values(mappings.grantedBranches).filter(Boolean);
    return (
      preview.mappingRequirements.linkedMembers.every((requirement) => {
        const selected = mappings.linkedMembers[requirement.target_member_id];
        if (!selected) return true;
        return preview.members.some(
          (member) => member.id === selected && member.gender === requirement.gender,
        );
      }) &&
      preview.mappingRequirements.grantedBranches.every((requirement) => {
        const selected = mappings.grantedBranches[requirement.target_branch_id];
        return !selected || preview.subfamilies.some((branch) => branch.id === selected);
      }) &&
      new Set(memberValues).size === memberValues.length &&
      new Set(branchValues).size === branchValues.length
    );
  }, [mappings, preview]);

  const loadDraft = () => {
    if (!preview || !mappingComplete) return;
    try {
      familyStore.stageFamilyCsvImport(preview, mappings);
      toast.success(t("family_csv_draft_loaded"));
      changeOpen(false);
    } catch (caught) {
      toast.error(
        caught instanceof ApiClientError && caught.code === "VERSION_CONFLICT"
          ? t("tree_version_conflict")
          : t("family_csv_mapping_invalid"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("family_csv_import_title")}</DialogTitle>
          <DialogDescription>{t("family_csv_import_description")}</DialogDescription>
        </DialogHeader>

        {dirty ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            {t("family_csv_save_or_discard")}
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                loading={loading}
              >
                <Upload aria-hidden="true" />
                {t("family_csv_choose_file")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => downloadText("family-tree-template.csv", familyCsvTemplate())}
              >
                <Download aria-hidden="true" />
                {t("family_csv_download_template")}
              </Button>
              {fileName ? <span className="text-sm text-muted-foreground">{fileName}</span> : null}
              <input
                ref={inputRef}
                className="sr-only"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void selectFile(event.target.files?.[0])}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("family_csv_required_fields")}</p>
          </section>
        )}

        {issues.length ? (
          <IssueList issues={issues} onDownload={() => downloadIssues(issues)} />
        ) : null}
        {preview ? (
          <>
            <Summary preview={preview} />
            {preview.warnings.length ? (
              <IssueList
                issues={preview.warnings as FamilyCsvIssue[]}
                onDownload={() => downloadIssues(preview.warnings as FamilyCsvIssue[])}
              />
            ) : null}
            <MappingFields
              preview={preview}
              mappings={mappings}
              setMappings={setMappings}
              lang={lang}
            />
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={!preview || !mappingComplete || dirty}
            onClick={loadDraft}
          >
            {t("family_csv_load_draft")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ preview }: { preview: FamilyCsvPreviewResponse }) {
  const { t } = useI18n();
  const items = [
    [t("family_csv_members"), preview.summary.members],
    [t("family_csv_parent_links"), preview.summary.parentLinks],
    [t("family_csv_spouse_links"), preview.summary.spouseLinks],
    [t("family_csv_branches"), preview.summary.branches],
  ];
  return (
    <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={String(label)} className="rounded-lg border bg-muted/30 p-3 text-center">
          <div className="text-xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      ))}
    </section>
  );
}

function MappingFields({
  preview,
  mappings,
  setMappings,
  lang,
}: {
  preview: FamilyCsvPreviewResponse;
  mappings: MappingState;
  setMappings: React.Dispatch<React.SetStateAction<MappingState>>;
  lang: "en" | "ar";
}) {
  const { t } = useI18n();
  if (
    !preview.mappingRequirements.linkedMembers.length &&
    !preview.mappingRequirements.grantedBranches.length
  )
    return null;
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">{t("family_csv_preserve_connections")}</h3>
        <p className="text-sm text-muted-foreground">{t("family_csv_preserve_connections_desc")}</p>
      </div>
      {preview.mappingRequirements.linkedMembers.map((requirement) => (
        <div
          key={requirement.target_member_id}
          className="grid gap-2 sm:grid-cols-2 sm:items-center"
        >
          <Label htmlFor={`member-map-${requirement.target_member_id}`}>
            {localName(requirement, lang)} · {t(requirement.gender)}
          </Label>
          <select
            id={`member-map-${requirement.target_member_id}`}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={mappings.linkedMembers[requirement.target_member_id] ?? ""}
            onChange={(event) =>
              setMappings((current) => ({
                ...current,
                linkedMembers: {
                  ...current.linkedMembers,
                  [requirement.target_member_id]: event.target.value,
                },
              }))
            }
          >
            <option value="">{t("family_csv_select_member")}</option>
            {preview.members
              .filter((member) => member.gender === requirement.gender)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {localName(member, lang)} ({member.id})
                </option>
              ))}
          </select>
        </div>
      ))}
      {preview.mappingRequirements.grantedBranches.map((requirement) => (
        <div
          key={requirement.target_branch_id}
          className="grid gap-2 sm:grid-cols-2 sm:items-center"
        >
          <Label htmlFor={`branch-map-${requirement.target_branch_id}`}>
            {localName(requirement, lang)}
          </Label>
          <select
            id={`branch-map-${requirement.target_branch_id}`}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={mappings.grantedBranches[requirement.target_branch_id] ?? ""}
            onChange={(event) =>
              setMappings((current) => ({
                ...current,
                grantedBranches: {
                  ...current.grantedBranches,
                  [requirement.target_branch_id]: event.target.value,
                },
              }))
            }
          >
            <option value="">{t("family_csv_select_branch")}</option>
            {preview.subfamilies.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {localName(branch, lang)} ({branch.id})
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  );
}

function IssueList({ issues, onDownload }: { issues: FamilyCsvIssue[]; onDownload: () => void }) {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <FileWarning className="h-4 w-4" />
          {t("family_csv_issues")}
        </h3>
        <Button size="sm" variant="ghost" onClick={onDownload}>
          <Download aria-hidden="true" />
          {t("family_csv_download_errors")}
        </Button>
      </div>
      <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
        {issues.slice(0, 200).map((issue, index) => (
          <li key={`${issue.code}-${index}`}>
            <span className="font-medium">{issue.code}</span>
            {issue.row ? ` · ${t("family_csv_row")} ${issue.row}` : ""}
            {issue.column ? ` · ${issue.column}` : ""}: {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function validationIssues(payload: unknown): FamilyCsvIssue[] {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("issues" in payload) ||
    !Array.isArray(payload.issues)
  )
    return [];
  return payload.issues.filter((issue): issue is FamilyCsvIssue =>
    Boolean(issue && typeof issue === "object" && "code" in issue && "message" in issue),
  );
}

function localName(value: { name_en?: string | null; name_ar?: string | null }, lang: "en" | "ar") {
  return lang === "ar"
    ? value.name_ar || value.name_en || ""
    : value.name_en || value.name_ar || "";
}

function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadIssues(issues: FamilyCsvIssue[]) {
  const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  downloadText(
    "family-import-errors.csv",
    `\uFEFFcode,row,column,message\r\n${issues.map((issue) => [issue.code, issue.row, issue.column, issue.message].map(cell).join(",")).join("\r\n")}\r\n`,
  );
}
