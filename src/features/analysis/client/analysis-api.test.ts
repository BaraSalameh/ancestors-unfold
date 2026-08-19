import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisScopeQuery, getAnalysisMembers, getAnalysisReport } from "./analysis-api";

const envelope = (data: unknown) => ({
  schema_version: 1,
  as_of_date: "2026-08-19",
  scope: {
    kind: "tree",
    treeId: "tree-id",
    treeNameEn: "Family",
    treeNameAr: null,
    branchId: null,
    branchNameEn: null,
    branchNameAr: null,
    role: "owner",
  },
  data,
});

afterEach(() => vi.unstubAllGlobals());

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

describe("analysis request bodies", () => {
  it("serializes report input exactly once", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(envelope([])), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await getAnalysisReport("tree-id", null, "branches");

    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({ report: "branches" });
  });

  it("serializes explorer input exactly once", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify(envelope({ items: [], total: 0, applied_filters: {}, next_cursor: null })),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetch);

    await getAnalysisMembers(
      "tree-id",
      null,
      { filters: {}, sort: "name", direction: "asc", view: "explorer" },
      null,
    );

    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
      filters: {},
      sort: "name",
      direction: "asc",
      view: "explorer",
      cursor: null,
      limit: 50,
    });
  });
});
