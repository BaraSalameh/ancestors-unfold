import { describe, expect, it } from "vitest";
import type { FamilyMember } from "./types";
import {
  eligibleParentCandidates,
  invalidFatherIdsForFemale,
  parentDisplayName,
  reconcileMotherForFather,
  searchParentCandidates,
} from "./parent-selection";

const member = (
  id: string,
  gender: FamilyMember["gender"],
  birth_date?: string,
  extra: Partial<FamilyMember> = {},
): FamilyMember => ({
  id,
  gender,
  birth_date,
  name_en: `English ${id}`,
  name_ar: `عربي ${id}`,
  created_at: "",
  updated_at: "",
  ...extra,
});

// The scenarios intentionally share one compact family-member fixture builder.
// eslint-disable-next-line max-lines-per-function
describe("parent selection", () => {
  it("filters candidates by role, known older birth date, and excluded relationships", () => {
    const candidates = [
      member("older", "male", "1970-01-01"),
      member("same-day", "male", "2000-01-01"),
      member("younger", "male", "2001-01-01"),
      member("unknown-date", "male"),
      member("unknown-member", "male", "1960-01-01", { is_unknown: true }),
      member("female", "female", "1960-01-01"),
      member("self", "male", "1960-01-01"),
      member("descendant", "male", "1960-01-01"),
    ];

    expect(
      eligibleParentCandidates({
        members: candidates,
        memberId: "self",
        birthDate: "2000-01-01",
        gender: "male",
        excludedIds: new Set(["descendant"]),
      }).map(({ id }) => id),
    ).toEqual(["older"]);
  });

  it("returns no candidates when the current birth date is unknown", () => {
    expect(
      eligibleParentCandidates({
        members: [member("older", "female", "1970-01-01")],
        birthDate: undefined,
        gender: "female",
      }),
    ).toEqual([]);
  });

  it("requires a query and searches either localized name", () => {
    const candidates = [
      member("one", "male", "1970-01-01", { name_en: "Yousef", name_ar: "يوسف" }),
    ];

    expect(searchParentCandidates(candidates, "")).toEqual([]);
    expect(searchParentCandidates(candidates, "yous")).toEqual(candidates);
    expect(searchParentCandidates(candidates, "يوس")).toEqual(candidates);
  });

  it("adds the birth year to either localized display name", () => {
    const candidate = member("one", "male", "1970-04-05");
    expect(parentDisplayName(candidate, "Yousef")).toBe("Yousef (1970)");
    expect(parentDisplayName(candidate, "يوسف")).toBe("يوسف (1970)");
  });

  it("clears a mother who is not a spouse of the selected father", () => {
    expect(reconcileMotherForFather("mother", "father", new Set(["other"]))).toBe("");
    expect(reconcileMotherForFather("mother", "father", new Set(["mother"]))).toBe("mother");
    expect(reconcileMotherForFather("mother", "", new Set())).toBe("mother");
  });

  it("excludes a female member's husband and his full ancestor chain", () => {
    const members = [
      member("wife", "female", "1980-01-01", { spouse_id: "husband" }),
      member("husband", "male", "1975-01-01", {
        father_id: "father-in-law",
        mother_id: "mother-in-law",
      }),
      member("father-in-law", "male", "1950-01-01", { father_id: "grandfather" }),
      member("mother-in-law", "female", "1955-01-01", {
        father_id: "maternal-grandfather",
      }),
      member("grandfather", "male", "1920-01-01"),
      member("maternal-grandfather", "male", "1925-01-01"),
    ];

    expect([...invalidFatherIdsForFemale(members, "wife")]).toEqual([
      "husband",
      "father-in-law",
      "mother-in-law",
      "grandfather",
      "maternal-grandfather",
    ]);
  });

  it("recognizes husbands through reciprocal and co-parent relationships", () => {
    const members = [
      member("wife", "female", "1980-01-01"),
      member("explicit-husband", "male", "1970-01-01", { spouse_ids: ["wife"] }),
      member("co-parent", "male", "1972-01-01"),
      member("child", "female", "2000-01-01", {
        father_id: "co-parent",
        mother_id: "wife",
      }),
    ];

    expect(invalidFatherIdsForFemale(members, "wife")).toEqual(
      new Set(["explicit-husband", "co-parent"]),
    );
  });

  it("excludes full and half-siblings and their direct children from both families", () => {
    const members = [
      member("wife-father", "male", "1950-01-01"),
      member("wife-mother", "female", "1952-01-01"),
      member("wife", "female", "1980-01-01", {
        father_id: "wife-father",
        mother_id: "wife-mother",
        spouse_id: "husband",
      }),
      member("wife-full-sibling", "male", "1970-01-01", {
        father_id: "wife-father",
        mother_id: "wife-mother",
      }),
      member("wife-paternal-half-sibling", "male", "1968-01-01", {
        father_id: "wife-father",
      }),
      member("wife-maternal-half-sibling", "female", "1972-01-01", {
        mother_id: "wife-mother",
      }),
      member("wife-nephew", "male", "1960-01-01", {
        father_id: "wife-full-sibling",
      }),
      member("husband-father", "male", "1948-01-01"),
      member("husband-mother", "female", "1950-01-01"),
      member("husband", "male", "1975-01-01", {
        father_id: "husband-father",
        mother_id: "husband-mother",
      }),
      member("husband-sister", "female", "1970-01-01", {
        father_id: "husband-father",
      }),
      member("husband-brother", "male", "1969-01-01", {
        mother_id: "husband-mother",
      }),
      member("husband-nephew", "male", "1960-01-01", {
        mother_id: "husband-sister",
      }),
      member("unrelated", "male", "1950-01-01"),
    ];

    const excluded = invalidFatherIdsForFemale(members, "wife");
    expect(excluded).toEqual(
      new Set([
        "husband",
        "husband-father",
        "husband-mother",
        "wife-full-sibling",
        "wife-paternal-half-sibling",
        "wife-maternal-half-sibling",
        "wife-nephew",
        "husband-sister",
        "husband-brother",
        "husband-nephew",
      ]),
    );

    expect(
      eligibleParentCandidates({
        members,
        memberId: "wife",
        birthDate: "1980-01-01",
        gender: "male",
        excludedIds: excluded,
      }).map(({ id }) => id),
    ).toEqual(["wife-father", "unrelated"]);
  });

  it("does not exclude grandchildren of siblings", () => {
    const members = [
      member("wife", "female", "1980-01-01", { father_id: "parent" }),
      member("sibling", "male", "1970-01-01", { father_id: "parent" }),
      member("sibling-child", "male", "1960-01-01", { father_id: "sibling" }),
      member("sibling-grandchild", "male", "1950-01-01", {
        father_id: "sibling-child",
      }),
    ];

    expect(invalidFatherIdsForFemale(members, "wife")).toEqual(
      new Set(["sibling", "sibling-child"]),
    );
  });
});
