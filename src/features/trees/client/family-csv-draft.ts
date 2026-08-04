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

// Mapping validates several independent entity constraints in one deterministic pass.
// eslint-disable-next-line complexity
export function buildFamilyCsvDraft(
  preview: FamilyCsvPreviewResponse,
  selections: FamilyCsvMappingSelections,
  currentMembers: FamilyMember[],
  currentBranches: SubFamily[],
  createId: () => string = () => crypto.randomUUID(),
): BuiltFamilyCsvDraft {
  const importedMembers = new Map(preview.members.map((member) => [member.id, member]));
  const importedBranches = new Map(preview.subfamilies.map((branch) => [branch.id, branch]));
  const selectedMemberSources = new Set<string>();
  const selectedBranchSources = new Set<string>();
  const memberTargets = new Map<string, string>();
  const branchTargets = new Map<string, string>();
  const protectedMemberIds = new Map<string, FamilyMember["gender"]>();
  const protectedBranchIds = new Set<string>();

  for (const requirement of preview.mappingRequirements.linkedMembers) {
    const sourceId = selections.linkedMembers[requirement.target_member_id];
    const imported = sourceId ? importedMembers.get(sourceId) : undefined;
    if (!imported || selectedMemberSources.has(sourceId) || imported.gender !== requirement.gender)
      throw new Error("INVALID_MEMBER_MAPPING");
    selectedMemberSources.add(sourceId);
    memberTargets.set(sourceId, requirement.target_member_id);
    protectedMemberIds.set(requirement.target_member_id, requirement.gender);
  }
  for (const requirement of preview.mappingRequirements.grantedBranches) {
    const sourceId = selections.grantedBranches[requirement.target_branch_id];
    if (!sourceId || !importedBranches.has(sourceId) || selectedBranchSources.has(sourceId))
      throw new Error("INVALID_BRANCH_MAPPING");
    selectedBranchSources.add(sourceId);
    branchTargets.set(sourceId, requirement.target_branch_id);
    protectedBranchIds.add(requirement.target_branch_id);
  }

  for (const member of preview.members)
    if (!memberTargets.has(member.id)) memberTargets.set(member.id, createId());
  for (const branch of preview.subfamilies)
    if (!branchTargets.has(branch.id)) branchTargets.set(branch.id, createId());
  for (const [sourceBranchId, targetBranchId] of branchTargets) {
    if (!protectedBranchIds.has(targetBranchId)) continue;
    const rootSourceId = importedBranches.get(sourceBranchId)?.linked_male_id;
    const rootTargetId = rootSourceId ? memberTargets.get(rootSourceId) : undefined;
    if (rootTargetId) protectedMemberIds.set(rootTargetId, "male");
  }

  const mapMember = (id: string | undefined) => (id ? memberTargets.get(id) : undefined);
  const sourceMemberIds = new Map<string, string>();
  const members = preview.members.map((member) => {
    const targetId = memberTargets.get(member.id)!;
    sourceMemberIds.set(targetId, member.id);
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
      image_url: existing?.image_url,
      image_public_id: existing?.image_public_id,
      image_asset_id: existing?.image_asset_id,
      created_at: existing?.created_at ?? member.created_at,
      updated_at: new Date().toISOString(),
    };
  });
  const sourceBranchIds = new Map<string, string>();
  const subfamilies = preview.subfamilies.map((branch) => {
    const targetId = branchTargets.get(branch.id)!;
    sourceBranchIds.set(targetId, branch.id);
    const existing = currentBranches.find(({ id }) => id === targetId);
    return {
      ...branch,
      id: targetId,
      linked_male_id: mapMember(branch.linked_male_id),
      parent_subfamily_id: branch.parent_subfamily_id
        ? branchTargets.get(branch.parent_subfamily_id)
        : undefined,
      attachments: existing?.attachments?.map((attachment) => ({ ...attachment })) ?? [],
      created_at: existing?.created_at ?? branch.created_at,
      updated_at: new Date().toISOString(),
    };
  });
  return {
    members,
    subfamilies,
    sourceMemberIds,
    sourceBranchIds,
    protectedMemberIds,
    protectedBranchIds,
  };
}
