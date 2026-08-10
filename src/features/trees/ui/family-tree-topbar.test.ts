import { describe, expect, it } from "vitest";
import type { FamilyMember } from "@/features/members";
import { canvasSearchResultLabel } from "./canvas-search-result";

const createMember = (
  id: string,
  name_en: string,
  name_ar: string,
  father_id?: string,
): FamilyMember => ({
  id,
  name_en,
  name_ar,
  father_id,
  gender: "male",
  citizen_status: "resident",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

describe("canvas search result wiring", () => {
  it("shows the person and paternal names up to four generations with birth year", () => {
    const member = {
      ...createMember("member", "Ahmad", "أحمد", "father"),
      birth_date: "1984-03-12",
    };
    const members = [
      member,
      createMember("father", "Ali", "علي", "grandfather"),
      createMember("grandfather", "Hassan", "حسن", "great-grandfather"),
      createMember("great-grandfather", "Omar", "عمر"),
    ];
    const membersById = new Map(members.map((relative) => [relative.id, relative]));

    expect(canvasSearchResultLabel(member, membersById, "en")).toBe("Ahmad Ali Hassan Omar (1984)");
    expect(canvasSearchResultLabel(member, membersById, "ar")).toBe("أحمد علي حسن عمر (1984)");
  });
});
