import { describe, expect, it } from "vitest";
import {
  memberDescendants,
  memberSpouses,
  paternalAncestors,
  visibleDescendantEntries,
} from "./member-details";
import type { FamilyMember } from "./types";

const member = (id: string, values: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  name_en: id,
  name_ar: id,
  gender: "male",
  citizen_status: "resident",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...values,
});

describe("member details projections", () => {
  it("combines explicit spouses with spouses inferred from children without duplicates", () => {
    const father = member("father", { spouse_id: "mother", spouse_ids: ["mother"] });
    const mother = member("mother", { gender: "female" });
    const otherMother = member("other-mother", { gender: "female" });
    const child = member("child", { father_id: "father", mother_id: "other-mother" });
    expect(memberSpouses(father, [father, mother, otherMother, child])).toEqual([
      mother,
      otherMother,
    ]);
  });

  it("projects paternal ancestors and descendants in traversal order", () => {
    const grandfather = member("grandfather");
    const father = member("father", { father_id: "grandfather" });
    const child = member("child", { father_id: "father" });
    const grandchild = member("grandchild", { father_id: "child" });
    const members = [grandfather, father, child, grandchild];
    expect(paternalAncestors(child, members)).toEqual([father, grandfather]);
    expect(memberDescendants(father, members)).toEqual([
      { member: child, depth: 1, parentId: "father", hasDescendants: true },
      { member: grandchild, depth: 2, parentId: "child", hasDescendants: false },
    ]);
  });

  it("reveals each descendant subtree independently", () => {
    const root = member("root");
    const child = member("child", { father_id: root.id });
    const sibling = member("sibling", { father_id: root.id });
    const grandchild = member("grandchild", { mother_id: child.id });
    const greatGrandchild = member("great-grandchild", { father_id: grandchild.id });
    const descendants = memberDescendants(root, [
      root,
      child,
      sibling,
      grandchild,
      greatGrandchild,
    ]);

    expect(visibleDescendantEntries(descendants, new Set([child.id, grandchild.id]))).toEqual([
      descendants[0],
      descendants[3],
    ]);
    expect(visibleDescendantEntries(descendants, new Set([grandchild.id]))).toEqual([
      descendants[0],
      descendants[1],
      descendants[3],
    ]);
  });
});
