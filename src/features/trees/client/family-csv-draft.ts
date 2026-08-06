import type { FamilyMember, SubFamily } from "@/features/members/domain";
import type { FamilyCsvPreviewResponse } from "../api/tree-client";

export type FamilyCsvMappingSelections = {
  linkedMembers: Record<string, string>;
  grantedBranches: Record<string, string>;
};

type BuiltFamilyCsvDraft = {
  members: FamilyMember[];
  subfamilies: SubFamily[];
  sourceMemberIds: Map<string, string>;
  sourceBranchIds: Map<string, string>;
  protectedMemberIds: Map<string, FamilyMember["gender"]>;
  protectedBranchIds: Set<string>;
};

const existingSource = (entity: "member" | "branch", id: string) => `existing|${entity}|${id}`;

export function buildFamilyCsvDraft(
  preview: FamilyCsvPreviewResponse,
  _selections: FamilyCsvMappingSelections,
  currentMembers: FamilyMember[],
  currentBranches: SubFamily[],
): BuiltFamilyCsvDraft {
  const previewMemberSources = new Map(
    preview.sourceMemberIds.map(({ targetId, sourceId }) => [targetId, sourceId]),
  );
  const previewBranchSources = new Map(
    preview.sourceBranchIds.map(({ targetId, sourceId }) => [targetId, sourceId]),
  );
  const currentMemberIds = new Set(currentMembers.map(({ id }) => id));
  const currentBranchIds = new Set(currentBranches.map(({ id }) => id));
  if (preview.members.some(({ id }) => currentMemberIds.has(id)))
    throw new Error("INVALID_MEMBER_MAPPING");
  if (preview.subfamilies.some(({ id }) => currentBranchIds.has(id)))
    throw new Error("INVALID_BRANCH_MAPPING");

  const sourceMemberIds = new Map(
    currentMembers.map(({ id }) => [id, existingSource("member", id)]),
  );
  const importedMembers = preview.members.map((member) => {
    const sourceId = previewMemberSources.get(member.id);
    if (!sourceId) throw new Error("INVALID_MEMBER_MAPPING");
    sourceMemberIds.set(member.id, sourceId);
    return {
      ...member,
      spouse_ids: member.spouse_ids ? [...member.spouse_ids] : undefined,
      divorced_from: member.divorced_from ? [...member.divorced_from] : undefined,
      updated_at: new Date().toISOString(),
    };
  });
  const sourceBranchIds = new Map(
    currentBranches.map(({ id }) => [id, existingSource("branch", id)]),
  );
  const importedBranches = preview.subfamilies.map((branch) => {
    const sourceId = previewBranchSources.get(branch.id);
    if (!sourceId) throw new Error("INVALID_BRANCH_MAPPING");
    sourceBranchIds.set(branch.id, sourceId);
    return {
      ...branch,
      attachments: branch.attachments?.map((attachment) => ({ ...attachment })) ?? [],
      updated_at: new Date().toISOString(),
    };
  });
  return {
    members: [
      ...currentMembers.map((member) => ({
        ...member,
        spouse_ids: member.spouse_ids ? [...member.spouse_ids] : undefined,
        divorced_from: member.divorced_from ? [...member.divorced_from] : undefined,
      })),
      ...importedMembers,
    ],
    subfamilies: [
      ...currentBranches.map((branch) => ({
        ...branch,
        attachments: branch.attachments?.map((attachment) => ({ ...attachment })) ?? [],
      })),
      ...importedBranches,
    ],
    sourceMemberIds,
    sourceBranchIds,
    protectedMemberIds: new Map(),
    protectedBranchIds: new Set(),
  };
}
