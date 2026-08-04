import { describe, expect, it } from "vitest";
import {
  analysisExcludeWivesQuerySchema,
  memberPageSchema,
  savedViewCreateSchema,
} from "./schemas";

const query = { filters: {}, sort: "name", direction: "asc", limit: 50 } as const;

describe("analysis query schema", () => {
  it("keeps male-only and female-only gender filters distinct", () => {
    for (const gender of ["male", "female"] as const) {
      const parsed = memberPageSchema.parse({ ...query, filters: { genders: [gender] } });
      expect(parsed.filters.genders).toEqual([gender]);
    }
    expect(() =>
      memberPageSchema.parse({ ...query, filters: { genders: ["unspecified"] } }),
    ).toThrow();
    expect(() =>
      memberPageSchema.parse({ ...query, filters: { citizenStatuses: ["unknown"] } }),
    ).toThrow();
  });

  it("rejects reversed ranges and oversized pages", () => {
    expect(() =>
      memberPageSchema.parse({ ...query, filters: { minAge: 19, maxAge: 18 } }),
    ).toThrow();
    expect(() => memberPageSchema.parse({ ...query, limit: 101 })).toThrow();
  });

  it("accepts optional wife exclusion and remains compatible without it", () => {
    expect(
      memberPageSchema.parse({ ...query, filters: { excludeWives: true } }).filters.excludeWives,
    ).toBe(true);
    expect(memberPageSchema.parse(query).filters).toEqual({});
    expect(
      savedViewCreateSchema.parse({
        name: "Family only",
        definition: { filters: { excludeWives: true }, sort: "name", direction: "asc" },
      }).definition.filters.excludeWives,
    ).toBe(true);
  });

  it("parses only explicit boolean query values for shared wife exclusion", () => {
    expect(analysisExcludeWivesQuerySchema.parse("true")).toBe(true);
    expect(analysisExcludeWivesQuerySchema.parse("false")).toBe(false);
    expect(analysisExcludeWivesQuerySchema.parse(null)).toBe(false);
    expect(() => analysisExcludeWivesQuerySchema.parse("1")).toThrow();
  });
});
