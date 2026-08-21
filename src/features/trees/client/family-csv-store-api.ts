import type { FamilyMember, SubFamily } from "@/features/members/domain";
import { ApiClientError } from "@/shared/api/client";
import type { FamilyCsvPreviewResponse } from "../api/tree-client";
import { buildFamilyCsvDraft, type FamilyCsvMappingSelections } from "./family-csv-draft";
import type { PendingCsvImport } from "./family-draft-persistence";

type FamilyCsvStoreContext = {
  canImport(): boolean;
  canEdit(): boolean;
  isDirty(): boolean;
  remoteVersion(): number;
  members(): FamilyMember[];
  subfamilies(): SubFamily[];
  pendingImport(): PendingCsvImport | null;
  applyDraft(members: FamilyMember[], subfamilies: SubFamily[], pending: PendingCsvImport): void;
};

export function createFamilyCsvStoreApi(context: FamilyCsvStoreContext) {
  return {
    canImportFamilyCsv: () => context.canImport() && context.canEdit(),
    isFamilyCsvImportPending: () => Boolean(context.pendingImport()),
    protectedImportGender: (id: string) => context.pendingImport()?.protectedMemberIds.get(id),
    isProtectedImportBranch: (id: string) =>
      context.pendingImport()?.protectedBranchIds.has(id) ?? false,
    stageFamilyCsvImport(
      preview: FamilyCsvPreviewResponse,
      selections: FamilyCsvMappingSelections,
    ) {
      if (!context.canImport() || !context.canEdit()) throw new ApiClientError("FORBIDDEN", 403);
      if (context.isDirty()) throw new ApiClientError("UNSAVED_CHANGES", 409);
      if (preview.expectedVersion !== context.remoteVersion())
        throw new ApiClientError("VERSION_CONFLICT", 409);
      const draft = buildFamilyCsvDraft(
        preview,
        selections,
        context.members(),
        context.subfamilies(),
      );
      context.applyDraft(draft.members, draft.subfamilies, {
        expectedVersion: preview.expectedVersion,
        sourceMemberIds: draft.sourceMemberIds,
        sourceBranchIds: draft.sourceBranchIds,
        protectedMemberIds: draft.protectedMemberIds,
        protectedBranchIds: draft.protectedBranchIds,
      });
    },
  };
}
