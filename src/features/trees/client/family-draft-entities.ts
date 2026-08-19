import type { FamilyMember, SubFamily } from "@/features/members/domain";

export function cloneMembers(members: FamilyMember[]): FamilyMember[] {
  return members.map((member) => ({
    ...member,
    spouse_ids: member.spouse_ids ? [...member.spouse_ids] : undefined,
    divorced_from: member.divorced_from ? [...member.divorced_from] : undefined,
  }));
}

export function cloneSubfamilies(items: SubFamily[]): SubFamily[] {
  return items.map((item) => ({
    ...item,
    attachments: item.attachments?.map((attachment) => ({ ...attachment })) ?? [],
  }));
}

export function indexFamily(members: FamilyMember[], subfamilies: SubFamily[]) {
  return {
    memberById: new Map(members.map((member) => [member.id, member])),
    branchRootIds: new Set(
      subfamilies.flatMap(({ linked_male_id, status }) =>
        linked_male_id && status !== "inactive" ? [linked_male_id] : [],
      ),
    ),
  };
}
