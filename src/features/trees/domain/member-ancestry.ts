import type { FamilyMember } from "@/features/members";

export function isMemberDescendant(
  members: FamilyMember[],
  ancestorId: string,
  targetId: string,
): boolean {
  const stack = [ancestorId];
  const seen = new Set<string>();
  while (stack.length) {
    const currentId = stack.pop()!;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    for (const member of members) {
      if (member.father_id !== currentId && member.mother_id !== currentId) continue;
      if (member.id === targetId) return true;
      stack.push(member.id);
    }
  }
  return false;
}
