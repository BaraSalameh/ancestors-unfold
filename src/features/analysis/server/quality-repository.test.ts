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
  it("uses effective branch assignments, excludes wives, and disables branch-scope counts", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 });

    await readQualityReport({ query } as unknown as PoolClient, scope);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("branch_lineage");
    expect(sql).toContain("branch.depth,true direct_assignment");
    expect(sql).toContain("branch.depth,false direct_assignment");
    expect(sql).toContain("direct_assignment DESC");
    expect(sql).toContain("assignment.branch_id effective_branch_id");
    expect(sql).toContain("wife_member.gender='female'");
    expect(sql).toContain("husband.gender='male'");
    expect(sql).toContain("$3::text='tree' AND effective_branch_id IS NULL");
    expect(sql).toContain("id NOT IN (SELECT member_id FROM wives)");
    expect(sql).toContain("recorded_parent_roles AS");
    expect(sql).toContain("bool_or(relationship.parent_role='father') has_father");
    expect(sql).toContain("bool_or(relationship.parent_role='mother') has_mother");
    expect(sql).toContain("JOIN quality_ids child ON child.id=relationship.child_id");
    expect(sql).toContain("recorded_parent.tree_id=$1 AND recorded_parent.deleted_at IS NULL");
    expect(sql).toContain("WHERE NOT coalesce(parents.has_father,false)");
    expect(sql).toContain("OR NOT coalesce(parents.has_mother,false)) missing_parent");
    expect(query.mock.calls[0][1]).toEqual([scope.treeId, null, "tree"]);
  });

  it("rebuilds quality diagnostics from the complete quality scope", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 });

    await readQualityReport({ query } as unknown as PoolClient, scope);

    const sql = String(query.mock.calls[0][0]);
    expect(sql).not.toContain("$4::boolean");
    expect(sql).toContain("quality_ids AS");
    expect(sql).toContain("JOIN quality_ids child ON child.id=r.child_id");
    expect(sql).toContain("JOIN quality_ids parent ON parent.id=r.parent_id");
    expect(sql).toContain("JOIN quality_ids quality_child ON quality_child.id=r.child_id");
    expect(sql).toContain("JOIN quality_ids quality_parent ON quality_parent.id=r.parent_id");
    expect(sql).not.toContain("missing_citizenship");
    expect(sql).not.toContain("citizen_status IS NULL");
    expect(query.mock.calls[0][1]).toEqual([scope.treeId, null, "tree"]);
  });
});
