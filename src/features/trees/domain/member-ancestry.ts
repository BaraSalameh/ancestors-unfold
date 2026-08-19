import type { FamilyMember } from "@/features/members";

export function isMemberDescendant(
  members: FamilyMember[],
  ancestorId: string,
  targetId: string,
): boolean {
  const childrenByParent = new Map<string, string[]>();
  for (const member of members)
    for (const parentId of [member.father_id, member.mother_id]) {
      if (!parentId) continue;
      const children = childrenByParent.get(parentId);
      if (children) children.push(member.id);
      else childrenByParent.set(parentId, [member.id]);
    }
  const stack = [ancestorId];
  const seen = new Set<string>();
  while (stack.length) {
    const currentId = stack.pop()!;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    for (const childId of childrenByParent.get(currentId) ?? []) {
      if (childId === targetId) return true;
      stack.push(childId);
    }
  }
  return false;
}
