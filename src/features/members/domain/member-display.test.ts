import { describe, expect, it } from "vitest";

import type { FamilyMember } from "./types";
import {
  ancestorConnector,
  memberMatchesPaternalSearch,
  memberPaternalSearchLabel,
  memberSearchLabel,
} from "./member-display";

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
    expect(memberSearchLabel(member("1984-03-12"), "en")).toBe("Ahmad (1984)");
    expect(memberSearchLabel(member("1984-03-12"), "ar")).toBe("أحمد (1984)");
  });

  it("uses only the first two localized name words in search labels", () => {
    expect(
      memberSearchLabel(
        { ...member("1984-03-12"), name_en: "Ahmad Ali Hassan", name_ar: "أحمد علي حسن" },
        "en",
      ),
    ).toBe("Ahmad Ali (1984)");
    expect(
      memberSearchLabel(
        { ...member("1984-03-12"), name_en: "Ahmad Ali Hassan", name_ar: "أحمد علي حسن" },
        "ar",
      ),
    ).toBe("أحمد علي (1984)");
  });

  it("falls back to the other language and accepts a numeric birth year", () => {
    expect(
      memberSearchLabel({ name_en: "", name_ar: "أحمد علي حسن", birth_year: 1984 }, "en"),
    ).toBe("أحمد علي (1984)");
  });

  it.each([undefined, "", "unknown", "198x-03-12"])(
    "omits a missing or invalid birth year (%s)",
    (birthDate) => {
      expect(memberSearchLabel(member(birthDate), "en")).toBe("Ahmad");
    },
  );

  it("builds the Explorer-style paternal name chain and caps it at four records", () => {
    const person = { ...member("1984-03-12"), father_id: "father" };
    const father = { ...member(), id: "father", name_en: "Ali", father_id: "grandfather" };
    const grandfather = {
      ...member(),
      id: "grandfather",
      name_en: "Hassan",
      father_id: "great-grandfather",
    };
    const greatGrandfather = {
      ...member(),
      id: "great-grandfather",
      name_en: "Omar",
      father_id: "fifth-name",
    };
    const fifthName = { ...member(), id: "fifth-name", name_en: "Nimer" };
    const membersById = new Map(
      [person, father, grandfather, greatGrandfather, fifthName].map((relative) => [
        relative.id,
        relative,
      ]),
    );

    expect(memberPaternalSearchLabel(person, membersById, "en")).toBe(
      "Ahmad Ali Hassan Omar (1984)",
    );
  });

  it("matches either localized paternal chain and birth year", () => {
    const person = { ...member("1984-03-12"), father_id: "father" };
    const father = {
      ...member(),
      id: "father",
      name_en: "Saleh",
      name_ar: "صالح",
    };
    const membersById = new Map([person, father].map((relative) => [relative.id, relative]));

    expect(memberMatchesPaternalSearch(person, membersById, "saleh")).toBe(true);
    expect(memberMatchesPaternalSearch(person, membersById, "صالح")).toBe(true);
    expect(memberMatchesPaternalSearch(person, membersById, "1984")).toBe(true);
    expect(memberMatchesPaternalSearch(person, membersById, "nimer")).toBe(false);
  });

  it("falls back between languages and stops safely on cyclic ancestry", () => {
    const person = { ...member(), name_ar: "", father_id: "father" };
    const father = {
      ...member(),
      id: "father",
      name_en: "Saleh",
      name_ar: "صالح",
      father_id: person.id,
    };
    const membersById = new Map([person, father].map((relative) => [relative.id, relative]));

    expect(memberPaternalSearchLabel(person, membersById, "ar")).toBe("صالح");
    expect(memberPaternalSearchLabel(person, membersById, "en")).toBe("Ahmad Saleh");
  });
});
