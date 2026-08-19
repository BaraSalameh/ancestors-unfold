export type { FamilyMember, MemberInput, SubFamily } from "./types";
export { getSubfamilyMembers } from "./queries";
export { type StagedSpouse } from "./staged-spouse";
export {
  detachParentRelationship,
  ensureParentsAreSpouses,
  linkSpouses,
  removeMember,
  removeMembers,
  removeSpouseAttachment,
  setMotherRelationship,
  toggleDivorce,
} from "./relationships";
export { descendantIds } from "./relationships";
export { memberDeletionPlan, type MemberDeletionPlan } from "./member-deletion";
export { memberPaternalSearchLabel } from "./member-display";
export { isMemberDeceased } from "./member-status";
