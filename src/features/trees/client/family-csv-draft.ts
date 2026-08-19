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

type TargetMappings = {
  memberTargets: Map<string, string>;
  branchTargets: Map<string, string>;
  protectedMemberIds: Map<string, FamilyMember["gender"]>;
  protectedBranchIds: Set<string>;
};

function applyMemberSelections(
  preview: FamilyCsvPreviewResponse,
  selections: FamilyCsvMappingSelections,
  currentMemberIds: ReadonlySet<string>,
  memberTargets: Map<string, string>,
  protectedMemberIds: Map<string, FamilyMember["gender"]>,
) {
  const imported = new Map(preview.members.map((member) => [member.id, member]));
  const selectedSources = new Set<string>();
  for (const requirement of preview.mappingRequirements.linkedMembers) {
    const sourceId = selections.linkedMembers[requirement.target_member_id];
    if (!sourceId) continue;
    const source = imported.get(sourceId);
    const invalid =
      !currentMemberIds.has(requirement.target_member_id) ||
      !source ||
      source.gender !== requirement.gender ||
      selectedSources.has(sourceId);
    if (invalid) throw new Error("INVALID_MEMBER_MAPPING");
    selectedSources.add(sourceId);
    memberTargets.set(sourceId, requirement.target_member_id);
    protectedMemberIds.set(requirement.target_member_id, requirement.gender);
  }
}

function applyBranchSelections(
  preview: FamilyCsvPreviewResponse,
  selections: FamilyCsvMappingSelections,
  currentBranchIds: ReadonlySet<string>,
  branchTargets: Map<string, string>,
  protectedBranchIds: Set<string>,
) {
  const importedIds = new Set(preview.subfamilies.map(({ id }) => id));
  const selectedSources = new Set<string>();
  for (const requirement of preview.mappingRequirements.grantedBranches) {
    const sourceId = selections.grantedBranches[requirement.target_branch_id];
    if (!sourceId) continue;
    const invalid =
      !currentBranchIds.has(requirement.target_branch_id) ||
      !importedIds.has(sourceId) ||
      selectedSources.has(sourceId);
    if (invalid) throw new Error("INVALID_BRANCH_MAPPING");
    selectedSources.add(sourceId);
    branchTargets.set(sourceId, requirement.target_branch_id);
    protectedBranchIds.add(requirement.target_branch_id);
  }
}

function mapUnselectedIds(
  importedIds: readonly string[],
  currentIds: ReadonlySet<string>,
  targets: Map<string, string>,
  errorCode: string,
) {
  for (const id of importedIds) {
    if (targets.has(id)) continue;
    if (currentIds.has(id)) throw new Error(errorCode);
    targets.set(id, id);
  }
}

function buildTargetMappings(
  preview: FamilyCsvPreviewResponse,
  selections: FamilyCsvMappingSelections,
  currentMembers: FamilyMember[],
  currentBranches: SubFamily[],
): TargetMappings {
  const memberTargets = new Map<string, string>();
  const branchTargets = new Map<string, string>();
  const protectedMemberIds = new Map<string, FamilyMember["gender"]>();
  const protectedBranchIds = new Set<string>();
  const currentMemberIds = new Set(currentMembers.map(({ id }) => id));
  const currentBranchIds = new Set(currentBranches.map(({ id }) => id));
  applyMemberSelections(preview, selections, currentMemberIds, memberTargets, protectedMemberIds);
  applyBranchSelections(preview, selections, currentBranchIds, branchTargets, protectedBranchIds);
  mapUnselectedIds(
    preview.members.map(({ id }) => id),
    currentMemberIds,
    memberTargets,
    "INVALID_MEMBER_MAPPING",
  );
  mapUnselectedIds(
    preview.subfamilies.map(({ id }) => id),
    currentBranchIds,
    branchTargets,
    "INVALID_BRANCH_MAPPING",
  );
  return { memberTargets, branchTargets, protectedMemberIds, protectedBranchIds };
}

function sourceIds(entries: Array<{ targetId: string; sourceId: string }>) {
  return new Map(entries.map(({ targetId, sourceId }) => [targetId, sourceId]));
}

function importedMembers(
  preview: FamilyCsvPreviewResponse,
  targets: TargetMappings,
  currentMembers: FamilyMember[],
  sourceMemberIds: Map<string, string>,
) {
  const previewSources = sourceIds(preview.sourceMemberIds);
  const currentById = new Map(currentMembers.map((member) => [member.id, member]));
  const mapMember = (id: string | undefined) => (id ? targets.memberTargets.get(id) : undefined);
  return preview.members.map((member) => {
    const targetId = targets.memberTargets.get(member.id);
    const sourceId = previewSources.get(member.id);
    if (!targetId || !sourceId) throw new Error("INVALID_MEMBER_MAPPING");
    sourceMemberIds.set(targetId, sourceId);
    const existing = currentById.get(targetId);
    return {
      ...member,
      id: targetId,
      father_id: mapMember(member.father_id),
      mother_id: mapMember(member.mother_id),
      spouse_id: mapMember(member.spouse_id),
      spouse_ids: member.spouse_ids?.map((id) => mapMember(id)!),
      divorced_from: member.divorced_from?.map((id) => mapMember(id)!),
      subfamily_id: member.subfamily_id
        ? targets.branchTargets.get(member.subfamily_id)
        : undefined,
      image_url: existing?.image_url ?? member.image_url,
      image_public_id: existing?.image_public_id ?? member.image_public_id,
      image_asset_id: existing?.image_asset_id ?? member.image_asset_id,
      created_at: existing?.created_at ?? member.created_at,
      updated_at: new Date().toISOString(),
    };
  });
}

function importedBranches(
  preview: FamilyCsvPreviewResponse,
  targets: TargetMappings,
  currentBranches: SubFamily[],
  sourceBranchIds: Map<string, string>,
) {
  const previewSources = sourceIds(preview.sourceBranchIds);
  const currentById = new Map(currentBranches.map((branch) => [branch.id, branch]));
  return preview.subfamilies.map((branch) => {
    const targetId = targets.branchTargets.get(branch.id);
    const sourceId = previewSources.get(branch.id);
    if (!targetId || !sourceId) throw new Error("INVALID_BRANCH_MAPPING");
    sourceBranchIds.set(targetId, sourceId);
    const existing = currentById.get(targetId);
    return {
      ...branch,
      id: targetId,
      linked_male_id: branch.linked_male_id
        ? targets.memberTargets.get(branch.linked_male_id)
        : undefined,
      parent_subfamily_id: branch.parent_subfamily_id
        ? targets.branchTargets.get(branch.parent_subfamily_id)
        : undefined,
      attachments:
        existing?.attachments?.map((attachment) => ({ ...attachment })) ??
        branch.attachments?.map((attachment) => ({ ...attachment })) ??
        [],
      created_at: existing?.created_at ?? branch.created_at,
      updated_at: new Date().toISOString(),
    };
  });
}

function retainedMembers(current: FamilyMember[], protectedIds: ReadonlyMap<string, unknown>) {
  return current
    .filter(({ id }) => !protectedIds.has(id))
    .map((member) => ({
      ...member,
      spouse_ids: member.spouse_ids ? [...member.spouse_ids] : undefined,
      divorced_from: member.divorced_from ? [...member.divorced_from] : undefined,
    }));
}

function retainedBranches(current: SubFamily[], protectedIds: ReadonlySet<string>) {
  return current
    .filter(({ id }) => !protectedIds.has(id))
    .map((branch) => ({
      ...branch,
      attachments: branch.attachments?.map((attachment) => ({ ...attachment })) ?? [],
    }));
}

// Mapping validates and rewrites the complete member and branch graph in one deterministic pass.
export function buildFamilyCsvDraft(
  preview: FamilyCsvPreviewResponse,
  selections: FamilyCsvMappingSelections,
  currentMembers: FamilyMember[],
  currentBranches: SubFamily[],
): BuiltFamilyCsvDraft {
  const targets = buildTargetMappings(preview, selections, currentMembers, currentBranches);
  const sourceMemberIds = new Map(
    currentMembers
      .filter(({ id }) => !targets.protectedMemberIds.has(id))
      .map(({ id }) => [id, existingSource("member", id)]),
  );
  const sourceBranchIds = new Map(
    currentBranches
      .filter(({ id }) => !targets.protectedBranchIds.has(id))
      .map(({ id }) => [id, existingSource("branch", id)]),
  );
  const nextMembers = [
    ...retainedMembers(currentMembers, targets.protectedMemberIds),
    ...importedMembers(preview, targets, currentMembers, sourceMemberIds),
  ];
  const nextBranches = [
    ...retainedBranches(currentBranches, targets.protectedBranchIds),
    ...importedBranches(preview, targets, currentBranches, sourceBranchIds),
  ];
  const branchConflict = newBranchConflicts(currentBranches, nextBranches)[0];
  if (branchConflict) throw new Error(branchConflict.code);
  return {
    members: nextMembers,
    subfamilies: nextBranches,
    sourceMemberIds,
    sourceBranchIds,
    protectedMemberIds: targets.protectedMemberIds,
    protectedBranchIds: targets.protectedBranchIds,
  };
}
