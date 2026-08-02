import { describe, expect, it } from "vitest";
import { memberPageSchema } from "./schemas";

const query = { filters: {}, sort: "name", direction: "asc", limit: 50 } as const;

describe("analysis query schema", () => {
  it("keeps male-only, female-only, and unspecified gender filters distinct", () => {
    for (const gender of ["male", "female", "unspecified"] as const) {
      const parsed = memberPageSchema.parse({ ...query, filters: { genders: [gender] } });
      expect(parsed.filters.genders).toEqual([gender]);
    }
  });

  it("rejects reversed ranges and oversized pages", () => {
    expect(() =>
      memberPageSchema.parse({ ...query, filters: { minAge: 19, maxAge: 18 } }),
    ).toThrow();
    expect(() => memberPageSchema.parse({ ...query, limit: 101 })).toThrow();
  });
});
