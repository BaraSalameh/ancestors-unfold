import { describe, expect, it } from "vitest";

import type { FamilyMember } from "./types";
import { ancestorConnector, memberNameWithBirthYear } from "./member-display";

const member = (birth_date?: string): FamilyMember => ({
  id: "member-1",
  name_en: "Ahmad",
  name_ar: "أحمد",
  gender: "male",
  citizen_status: "resident",
  birth_date,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
});

describe("member display", () => {
  it("uses direction-aware ancestor connectors", () => {
    expect(ancestorConnector("ltr")).toBe("→");
    expect(ancestorConnector("rtl")).toBe("←");
  });

  it("appends a valid birth year to the localized member name", () => {
    expect(memberNameWithBirthYear(member("1984-03-12"), "en")).toBe("Ahmad (1984)");
    expect(memberNameWithBirthYear(member("1984-03-12"), "ar")).toBe("أحمد (1984)");
  });

  it.each([undefined, "", "unknown", "198x-03-12"])(
    "omits a missing or invalid birth year (%s)",
    (birthDate) => {
      expect(memberNameWithBirthYear(member(birthDate), "en")).toBe("Ahmad");
    },
  );
});
