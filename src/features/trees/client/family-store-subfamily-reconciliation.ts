import type { FamilyMember, SubFamily } from "@/features/members/domain";

export function reconcileDraftSubfamilyRoots(
  members: FamilyMember[],
  subfamilies: SubFamily[],
): { members: FamilyMember[]; subfamilies: SubFamily[] } {
  const activeMaleIds = new Set(
    members.filter(({ gender }) => gender === "male").map(({ id }) => id),
  );
  const removedBranchIds = new Set(
    subfamilies
      .filter(({ linked_male_id }) => linked_male_id && !activeMaleIds.has(linked_male_id))
      .map(({ id }) => id),
  );
  if (!removedBranchIds.size) return { members, subfamilies };
  const nextSubfamilies = subfamilies
    .filter(({ id }) => !removedBranchIds.has(id))
    .map((branch) =>
      branch.parent_subfamily_id && removedBranchIds.has(branch.parent_subfamily_id)
        ? { ...branch, parent_subfamily_id: undefined }
        : branch,
    );
  const nextMembers = members.map((member) =>
    member.subfamily_id && removedBranchIds.has(member.subfamily_id)
      ? { ...member, subfamily_id: undefined }
      : member,
  );
  return { members: nextMembers, subfamilies: nextSubfamilies };
}
