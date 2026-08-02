import { describe, expect, it } from "vitest";
import {
  detachParentRelationship,
  descendantIds,
  ensureParentsAreSpouses,
  isDescendant,
  linkSpouses,
  removeMember,
  removeSpouseAttachment,
  setMotherRelationship,
  toggleDivorce,
} from "./relationships";
import type { FamilyMember } from "./types";

const member = (id: string, gender: "male" | "female", patch: Partial<FamilyMember> = {}) => ({
  id,
  gender,
  name_en: id,
  name_ar: id,
  created_at: "created",
  updated_at: "old",
  ...patch,
});

describe("family relationships", () => {
  it("links and unlinks a mother while preserving parent spouse consistency", () => {
    const members = [
      member("father", "male"),
      member("mother", "female"),
      member("child", "male", { father_id: "father" }),
    ];

    const linked = setMotherRelationship(members, "child", "mother", "now");
    expect(linked.find(({ id }) => id === "child")).toMatchObject({
      mother_id: "mother",
      updated_at: "now",
    });
    expect(linked.find(({ id }) => id === "father")?.spouse_ids).toContain("mother");

    const unlinked = setMotherRelationship(linked, "child", undefined, "later");
    expect(unlinked.find(({ id }) => id === "child")).toMatchObject({
      mother_id: undefined,
      updated_at: "later",
    });
    expect(unlinked.find(({ id }) => id === "father")?.spouse_ids).toContain("mother");
  });

  it.each([
    ["father_id", { mother_id: "mother" }],
    ["mother_id", { father_id: "anas" }],
  ] as const)(
    "detaches only the selected parent while preserving a wife",
    (role, remainingParent) => {
      const members = [
        member("mohammad", "male", {
          spouse_id: "randa",
          spouse_ids: ["randa"],
          divorced_from: ["other-wife"],
        }),
        member("anas", "male"),
        member("mother", "female"),
        member("father", "male"),
        member("randa", "female", {
          father_id: "anas",
          mother_id: "mother",
          spouse_id: "mohammad",
        }),
        member("child", "male", { father_id: "mohammad", mother_id: "randa" }),
      ];

      const result = detachParentRelationship(members, "randa", role, "now");

      expect(result.find(({ id }) => id === "randa")).toMatchObject({
        id: "randa",
        ...remainingParent,
        spouse_id: "mohammad",
        updated_at: "now",
      });
      expect(result.find(({ id }) => id === "randa")?.[role]).toBeUndefined();
      expect(result.find(({ id }) => id === "mohammad")).toEqual(members[0]);
      expect(result.find(({ id }) => id === "child")).toEqual(members[5]);
      expect(result).toHaveLength(members.length);
    },
  );

  it("persists a union for a child's recorded parents", () => {
    const result = ensureParentsAreSpouses(
      [
        member("father", "male"),
        member("mother", "female"),
        member("child", "male", { father_id: "father", mother_id: "mother" }),
      ],
      "child",
      "now",
    );

    expect(result.find((item) => item.id === "father")).toMatchObject({
      spouse_id: "mother",
      spouse_ids: ["mother"],
    });
    expect(result.find((item) => item.id === "mother")).toMatchObject({
      spouse_id: "father",
    });
  });

  it("leaves an explicit union intact when the child has no mother", () => {
    const members = linkSpouses(
      [
        member("father", "male"),
        member("mother", "female"),
        member("child", "male", { father_id: "father" }),
      ],
      "father",
      "mother",
      "now",
    );

    expect(ensureParentsAreSpouses(members, "child", "later")).toBe(members);
  });
});

describe("spouse relationship mutations", () => {
  it("deletes an unanchored spouse and clears all references to her", () => {
    const result = removeSpouseAttachment(
      [
        member("husband", "male", {
          spouse_id: "wife",
          spouse_ids: ["wife"],
          divorced_from: ["wife"],
        }),
        member("other-husband", "male", { spouse_id: "wife", spouse_ids: ["wife"] }),
        member("wife", "female", {
          spouse_id: "husband",
          divorced_from: ["husband"],
        }),
        member("shared-child", "male", { father_id: "husband", mother_id: "wife" }),
        member("other-child", "female", {
          father_id: "other-husband",
          mother_id: "wife",
        }),
      ],
      "husband",
      "wife",
      "now",
    );

    expect(result.find((item) => item.id === "wife")).toBeUndefined();
    expect(result.find((item) => item.id === "husband")).toMatchObject({
      spouse_id: undefined,
      spouse_ids: [],
      divorced_from: [],
    });
    expect(result.find((item) => item.id === "shared-child")?.mother_id).toBeUndefined();
    expect(result.find((item) => item.id === "other-child")?.mother_id).toBeUndefined();
    expect(result.find((item) => item.id === "other-husband")).toMatchObject({
      spouse_id: undefined,
      spouse_ids: [],
    });
  });

  it.each([{ father_id: "parent" }, { mother_id: "parent" }])(
    "preserves an anchored spouse while detaching her family attachment",
    (parentLink) => {
      const result = removeSpouseAttachment(
        [
          member("husband", "male", { spouse_id: "wife", spouse_ids: ["wife"] }),
          member("parent", "male"),
          member("wife", "female", { spouse_id: "husband", ...parentLink }),
          member("child", "male", { father_id: "husband", mother_id: "wife" }),
        ],
        "husband",
        "wife",
        "now",
      );

      expect(result.find((item) => item.id === "wife")).toMatchObject({
        ...parentLink,
        spouse_id: undefined,
      });
      expect(result.find((item) => item.id === "child")?.mother_id).toBeUndefined();
    },
  );

  it("links spouses symmetrically without duplicating the male ordering", () => {
    const result = linkSpouses(
      [member("m", "male", { spouse_ids: ["f"] }), member("f", "female")],
      "m",
      "f",
      "now",
    );
    expect(result[0]).toMatchObject({ spouse_id: "f", spouse_ids: ["f"], updated_at: "now" });
    expect(result[1]).toMatchObject({ spouse_id: "m", updated_at: "now" });
  });

  it("adds and removes divorce markers on both partners", () => {
    const members = [member("m", "male"), member("f", "female")];
    const divorced = toggleDivorce(members, "m", "f", "one");
    expect(divorced.map((value) => value.divorced_from)).toEqual([["f"], ["m"]]);
    expect(toggleDivorce(divorced, "m", "f", "two").map((value) => value.divorced_from)).toEqual([
      [],
      [],
    ]);
  });
});

describe("relationship graph cleanup", () => {
  it("removes all references when deleting a member", () => {
    const result = removeMember(
      [
        member("gone", "male"),
        member("child", "female", {
          father_id: "gone",
          spouse_id: "gone",
          spouse_ids: ["gone"],
          divorced_from: ["gone"],
        }),
      ],
      "gone",
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: "child",
        father_id: undefined,
        spouse_id: undefined,
        spouse_ids: [],
        divorced_from: [],
      }),
    ]);
  });

  it("handles cyclic malformed ancestry without looping", () => {
    const members = [
      member("a", "male", { father_id: "b" }),
      member("b", "male", { father_id: "a" }),
      member("c", "female", { father_id: "b" }),
    ];
    expect(isDescendant(members, "a", "c")).toBe(true);
    expect(isDescendant(members, "a", "missing")).toBe(false);
  });

  it("collects a detached member and the complete descendant subtree once", () => {
    const members = [
      member("root", "male"),
      member("child", "female", { father_id: "root" }),
      member("grandchild", "male", { mother_id: "child" }),
      member("unrelated", "female"),
    ];
    expect(descendantIds(members, "root")).toEqual(["root", "child", "grandchild"]);
  });
});
