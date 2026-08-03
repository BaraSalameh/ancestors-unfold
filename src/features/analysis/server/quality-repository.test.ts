import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisScope } from "../domain/types";
import { readQualityReport } from "./quality-repository";

const scope: AnalysisScope = {
  kind: "tree",
  treeId: "00000000-0000-4000-8000-000000000001",
  treeNameEn: "Family",
  treeNameAr: "Family",
  branchId: null,
  branchNameEn: null,
  branchNameAr: null,
  role: "owner",
};

describe("quality repository", () => {
  it("excludes wives from missing branch counts and disables the count for branch scope", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 });

    await readQualityReport({ query } as unknown as PoolClient, scope);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("wife_member.gender='female'");
    expect(sql).toContain("husband.gender='male'");
    expect(sql).toContain("$3::text='tree' AND subfamily_id IS NULL");
    expect(sql).toContain("id NOT IN (SELECT member_id FROM wives)");
  });
});
