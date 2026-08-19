import type { FamilyMember } from "@/features/members/domain";
import type { TreeAccessScope } from "../domain/access-policy";
import type { FamilyLoadState, PersistenceState } from "./family-store-types";

type SelectorContext = {
  activeTreeId(): string;
  persistenceError(): string | null;
  persistenceState(): PersistenceState;
  loadState(): FamilyLoadState;
  members(): FamilyMember[];
  canManageSubfamilies(): boolean;
  accessScope(): TreeAccessScope;
  assignedBranchId(): string | undefined;
  canEdit(): boolean;
  member(id: string): FamilyMember | undefined;
  stagedImage(id: string): File | undefined;
  memberImageSrc(id: string): string | undefined;
  branchRoot(id: string): boolean;
  subscribe(listener: () => void): () => void;
};

export function createFamilyStoreSelectors(context: SelectorContext) {
  return {
    getActiveTreeId: context.activeTreeId,
    getPersistenceError: context.persistenceError,
    getPersistenceState: context.persistenceState,
    getLoadState: context.loadState,
    getAll: context.members,
    canManageSubfamilies: context.canManageSubfamilies,
    getAccessScope: context.accessScope,
    getAssignedBranchId: context.assignedBranchId,
    canEditActiveTree: context.canEdit,
    get: context.member,
    getStagedMemberImage: context.stagedImage,
    getMemberImageSrc: context.memberImageSrc,
    isBranchRoot: context.branchRoot,
    subscribe: context.subscribe,
  };
}
