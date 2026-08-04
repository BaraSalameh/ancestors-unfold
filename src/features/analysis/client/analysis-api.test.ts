import { describe, expect, it } from "vitest";
import { analysisScopeQuery } from "./analysis-api";

describe("analysis scope query", () => {
  it("omits false wife exclusion and includes true in report URLs", () => {
    expect(analysisScopeQuery(null)).toBe("");
    expect(analysisScopeQuery(null, false)).toBe("");
    expect(analysisScopeQuery(null, true)).toBe("?excludeWives=true");
  });

  it("combines branch scope and wife exclusion with URL encoding", () => {
    expect(analysisScopeQuery("branch/id", true)).toBe("?branchId=branch%2Fid&excludeWives=true");
  });
});
