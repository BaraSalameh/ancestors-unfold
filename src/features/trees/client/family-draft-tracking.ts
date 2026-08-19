import type { FamilyMember, SubFamily } from "@/features/members/domain";
import type { DraftChange } from "./family-draft-history";

const entityMatches = <T>(entity: T | undefined, baseline: T | undefined) =>
  entity === baseline || JSON.stringify(entity) === JSON.stringify(baseline);

export function createFamilyDraftTracking() {
  let baselineMembers: FamilyMember[] = [];
  let baselineSubfamilies: SubFamily[] = [];
  let baselineMemberById = new Map<string, FamilyMember>();
  let baselineSubfamilyById = new Map<string, SubFamily>();
  let dirtyMemberIds = new Set<string>();
  let dirtySubfamilyIds = new Set<string>();

  const reset = () => {
    dirtyMemberIds = new Set();
    dirtySubfamilyIds = new Set();
    baselineMemberById = new Map(baselineMembers.map((member) => [member.id, member]));
    baselineSubfamilyById = new Map(baselineSubfamilies.map((branch) => [branch.id, branch]));
  };

  return {
    get baselineMembers() {
      return baselineMembers;
    },
    get baselineSubfamilies() {
      return baselineSubfamilies;
    },
    get dirtyMemberIds() {
      return dirtyMemberIds;
    },
    get dirtySubfamilyIds() {
      return dirtySubfamilyIds;
    },
    setBaseline(members: FamilyMember[], subfamilies: SubFamily[]) {
      baselineMembers = members;
      baselineSubfamilies = subfamilies;
      reset();
    },
    baselineMember(id: string) {
      return baselineMemberById.get(id);
    },
    baselineAssetIds() {
      return new Set(baselineMembers.map(({ image_asset_id }) => image_asset_id));
    },
    reset,
    hasChanges() {
      return dirtyMemberIds.size > 0 || dirtySubfamilyIds.size > 0;
    },
    recalculate(members: FamilyMember[], subfamilies: SubFamily[]) {
      reset();
      const memberById = new Map(members.map((member) => [member.id, member]));
      const branchById = new Map(subfamilies.map((branch) => [branch.id, branch]));
      for (const id of new Set([...memberById.keys(), ...baselineMemberById.keys()]))
        if (!entityMatches(memberById.get(id), baselineMemberById.get(id))) dirtyMemberIds.add(id);
      for (const id of new Set([...branchById.keys(), ...baselineSubfamilyById.keys()]))
        if (!entityMatches(branchById.get(id), baselineSubfamilyById.get(id)))
          dirtySubfamilyIds.add(id);
    },
    refresh(change: DraftChange, members: FamilyMember[], subfamilies: SubFamily[]) {
      const memberById = new Map(members.map((member) => [member.id, member]));
      const branchById = new Map(subfamilies.map((branch) => [branch.id, branch]));
      for (const { id } of change.members) {
        if (entityMatches(memberById.get(id), baselineMemberById.get(id)))
          dirtyMemberIds.delete(id);
        else dirtyMemberIds.add(id);
      }
      for (const { id } of change.subfamilies) {
        if (entityMatches(branchById.get(id), baselineSubfamilyById.get(id)))
          dirtySubfamilyIds.delete(id);
        else dirtySubfamilyIds.add(id);
      }
    },
  };
}
