import { describe, expect, it } from "vitest";
import type { FamilyMember } from "@/features/members";
import { matchingMaleMember } from "./male-member-match";

const male: FamilyMember = {
  id: "male",
  name_en: "English Name",
  name_ar: "الاسم العربي",
  gender: "male",
  citizen_status: "resident",
  created_at: "created",
  updated_at: "updated",
};

describe("male member matching", () => {
  it("matches displayed, English, and exact Arabic names", () => {
    expect(matchingMaleMember([male], " english name ", "en")).toBe(male);
    expect(matchingMaleMember([male], "ENGLISH NAME", "ar")).toBe(male);
    expect(matchingMaleMember([male], "الاسم العربي", "en")).toBe(male);
  });

  it("does not partially match a name", () => {
    expect(matchingMaleMember([male], "English", "en")).toBeUndefined();
  });
});
