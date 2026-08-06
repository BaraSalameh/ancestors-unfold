import type { FamilyMember, SubFamily } from "@/features/members/domain";
import type { FamilyCsvPreviewResponse } from "../api/tree-client";
import { newBranchConflicts } from "../domain/branch-uniqueness";

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

// Mapping validates and rewrites the complete member and branch graph in one deterministic pass.
// eslint-disable-next-line complexity, max-lines-per-function
export function buildFamilyCsvDraft(
  preview: FamilyCsvPreviewResponse,
  selections: FamilyCsvMappingSelections,
  currentMembers: FamilyMember[],
  currentBranches: SubFamily[],
): BuiltFamilyCsvDraft {
  const importedMembersById = new Map(preview.members.map((member) => [member.id, member]));
  const importedBranchesById = new Map(preview.subfamilies.map((branch) => [branch.id, branch]));
  const memberTargets = new Map<string, string>();
  const branchTargets = new Map<string, string>();
  const selectedMemberSources = new Set<string>();
  const selectedBranchSources = new Set<string>();
  const protectedMemberIds = new Map<string, FamilyMember["gender"]>();
  const protectedBranchIds = new Set<string>();
  const currentMemberIds = new Set(currentMembers.map(({ id }) => id));
  const currentBranchIds = new Set(currentBranches.map(({ id }) => id));

  for (const requirement of preview.mappingRequirements.linkedMembers) {
    const sourceId = selections.linkedMembers[requirement.target_member_id];
    if (!sourceId) continue;
    const imported = importedMembersById.get(sourceId);
    if (
      !currentMemberIds.has(requirement.target_member_id) ||
      !imported ||
      imported.gender !== requirement.gender ||
      selectedMemberSources.has(sourceId)
    )
      throw new Error("INVALID_MEMBER_MAPPING");
    selectedMemberSources.add(sourceId);
    memberTargets.set(sourceId, requirement.target_member_id);
    protectedMemberIds.set(requirement.target_member_id, requirement.gender);
  }
  for (const requirement of preview.mappingRequirements.grantedBranches) {
    const sourceId = selections.grantedBranches[requirement.target_branch_id];
    if (!sourceId) continue;
    if (
      !currentBranchIds.has(requirement.target_branch_id) ||
      !importedBranchesById.has(sourceId) ||
      selectedBranchSources.has(sourceId)
    )
      throw new Error("INVALID_BRANCH_MAPPING");
    selectedBranchSources.add(sourceId);
    branchTargets.set(sourceId, requirement.target_branch_id);
    protectedBranchIds.add(requirement.target_branch_id);
  }
  for (const member of preview.members) {
    if (memberTargets.has(member.id)) continue;
    if (currentMemberIds.has(member.id)) throw new Error("INVALID_MEMBER_MAPPING");
    memberTargets.set(member.id, member.id);
  }
  for (const branch of preview.subfamilies) {
    if (branchTargets.has(branch.id)) continue;
    if (currentBranchIds.has(branch.id)) throw new Error("INVALID_BRANCH_MAPPING");
    branchTargets.set(branch.id, branch.id);
  }

  const mapMember = (id: string | undefined) => (id ? memberTargets.get(id) : undefined);
  const previewMemberSources = new Map(
    preview.sourceMemberIds.map(({ targetId, sourceId }) => [targetId, sourceId]),
  );
  const previewBranchSources = new Map(
    preview.sourceBranchIds.map(({ targetId, sourceId }) => [targetId, sourceId]),
  );
  const sourceMemberIds = new Map(
    currentMembers
      .filter(({ id }) => !protectedMemberIds.has(id))
      .map(({ id }) => [id, existingSource("member", id)]),
  );
  const importedMembers = preview.members.map((member) => {
    const targetId = memberTargets.get(member.id)!;
    const sourceId = previewMemberSources.get(member.id);
    if (!sourceId) throw new Error("INVALID_MEMBER_MAPPING");
    sourceMemberIds.set(targetId, sourceId);
    const existing = currentMembers.find(({ id }) => id === targetId);
    return {
      ...member,
      id: targetId,
      father_id: mapMember(member.father_id),
      mother_id: mapMember(member.mother_id),
      spouse_id: mapMember(member.spouse_id),
      spouse_ids: member.spouse_ids?.map((id) => mapMember(id)!),
      divorced_from: member.divorced_from?.map((id) => mapMember(id)!),
      subfamily_id: member.subfamily_id ? branchTargets.get(member.subfamily_id) : undefined,
      image_url: existing?.image_url ?? member.image_url,
      image_public_id: existing?.image_public_id ?? member.image_public_id,
      image_asset_id: existing?.image_asset_id ?? member.image_asset_id,
      created_at: existing?.created_at ?? member.created_at,
      updated_at: new Date().toISOString(),
    };
  });
  const sourceBranchIds = new Map(
    currentBranches
      .filter(({ id }) => !protectedBranchIds.has(id))
      .map(({ id }) => [id, existingSource("branch", id)]),
  );
  const importedBranches = preview.subfamilies.map((branch) => {
    const targetId = branchTargets.get(branch.id)!;
    const sourceId = previewBranchSources.get(branch.id);
    if (!sourceId) throw new Error("INVALID_BRANCH_MAPPING");
    sourceBranchIds.set(targetId, sourceId);
    const existing = currentBranches.find(({ id }) => id === targetId);
    return {
      ...branch,
      id: targetId,
      linked_male_id: mapMember(branch.linked_male_id),
      parent_subfamily_id: branch.parent_subfamily_id
        ? branchTargets.get(branch.parent_subfamily_id)
        : undefined,
      attachments:
        existing?.attachments?.map((attachment) => ({ ...attachment })) ??
        branch.attachments?.map((attachment) => ({ ...attachment })) ??
        [],
      created_at: existing?.created_at ?? branch.created_at,
      updated_at: new Date().toISOString(),
    };
  });
  const subfamilies = [
    ...currentBranches
      .filter(({ id }) => !protectedBranchIds.has(id))
      .map((branch) => ({
        ...branch,
        attachments: branch.attachments?.map((attachment) => ({ ...attachment })) ?? [],
      })),
    ...importedBranches,
  ];
  const branchConflict = newBranchConflicts(currentBranches, subfamilies)[0];
  if (branchConflict) throw new Error(branchConflict.code);
  return {
    members: [
      ...currentMembers
        .filter(({ id }) => !protectedMemberIds.has(id))
        .map((member) => ({
          ...member,
          spouse_ids: member.spouse_ids ? [...member.spouse_ids] : undefined,
          divorced_from: member.divorced_from ? [...member.divorced_from] : undefined,
        })),
      ...importedMembers,
    ],
    subfamilies,
    sourceMemberIds,
    sourceBranchIds,
    protectedMemberIds,
    protectedBranchIds,
  };
}
