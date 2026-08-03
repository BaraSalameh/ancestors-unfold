import { describe, expect, it } from "vitest";
import { isMemberDeceased } from "./member-status";

describe("member life status", () => {
  it("recognizes explicit deceased status without a death date", () => {
    expect(isMemberDeceased({ is_deceased: true })).toBe(true);
  });

  it("keeps legacy death dates compatible", () => {
    expect(isMemberDeceased({ death_date: "2020-01-02" })).toBe(true);
  });

  it("does not mark living members as deceased", () => {
    expect(isMemberDeceased({ is_deceased: false })).toBe(false);
    expect(isMemberDeceased({})).toBe(false);
  });
});
