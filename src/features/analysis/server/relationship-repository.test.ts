import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisScope } from "../domain/types";
import { readRelationshipReport } from "./relationship-repository";

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

describe("relationship report repository", () => {
  it("builds the expanded relationship scope and valid marriages", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 });
    await readRelationshipReport({ query } as unknown as PoolClient, scope);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("report_ids AS");
    expect(sql).toContain("JOIN scoped_ids scoped ON scoped.id=scoped_partner.member_id");
    expect(sql).toContain("SELECT partner.member_id");
    expect(sql).toContain("JOIN scoped_ids scoped_child ON scoped_child.id=relationship.child_id");
    expect(sql).toContain("SELECT relationship.parent_id");
    expect(sql).toContain("JOIN report_ids child ON child.id=relationship.child_id");
    expect(sql).toContain("JOIN report_ids parent ON parent.id=relationship.parent_id");
    expect(sql).toContain("partner.member_id NOT IN (SELECT id FROM report_ids)");
    expect(sql).toContain("SELECT count(DISTINCT partner.member_id)");
    expect(sql).toContain("active_partner.tree_id=$1 AND active_partner.deleted_at IS NULL");
  });

  it("counts each living male once in the requested relationship indicators", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{}], rowCount: 1 });
    await readRelationshipReport({ query } as unknown as PoolClient, scope);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("male_relationship_stats AS");
    expect(sql).toContain("member.gender='male' AND NOT member.is_deceased");
    expect(sql).toContain("marriage.status='current'");
    expect(sql).toContain("marriage.status='divorced'");
    expect(sql).toContain("recorded_union.deleted_at IS NULL");
    expect(sql).toContain("lifecycle_age>=18");
    expect(sql).toContain("lifecycle_age<25");
    expect(sql).toContain("lifecycle_age>=25");
    expect(sql).toContain("married AND NOT has_recorded_children");
    expect(sql).not.toContain("$4::boolean");
    expect(query.mock.calls[0][1]).toEqual([scope.treeId, null, "tree"]);
  });
});
