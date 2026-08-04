import type { PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisScope, SummaryData } from "../domain/types";
import { readAnalysisMembers, readAnalysisSummary, readBranchReport } from "./repository";

const scope: AnalysisScope = {
  kind: "tree",
  treeId: "00000000-0000-4000-8000-000000000001",
  treeNameEn: "Family",
  treeNameAr: "العائلة",
  branchId: null,
  branchNameEn: null,
  branchNameAr: null,
  role: "owner",
};

const summary: SummaryData = {
  total: 0,
  living: 0,
  deceased: 0,
  male: 0,
  female: 0,
  adults: 0,
  living_adults: 0,
  minors: 0,
  unknown_age: 0,
  resident: 0,
  non_resident: 0,
  average_age: null,
  median_age: null,
  average_lifespan: null,
  maximum_generation_depth: 0,
  oldest_member: null,
  youngest_member: null,
  age_bands: [],
  birth_decades: [],
  death_decades: [],
};

describe("analysis repository queries", () => {
  it("limits overview demographics and ten-year bands to living members", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [summary], rowCount: 1 });
    await readAnalysisSummary({ query } as unknown as PoolClient, scope);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("NOT is_deceased AND gender='male'");
    expect(sql).toContain("NOT is_deceased AND lifecycle_age>=18");
    expect(sql).toContain("generate_series(0,stats.max_band,10)");
    expect(sql).toContain("WHERE NOT is_deceased AND lifecycle_age IS NOT NULL");
    expect(sql).toContain("WHERE is_deceased AND death_date IS NOT NULL");
    expect(sql).toContain("SELECT 'unknown',count(*)::integer FROM report_members");
    expect(sql).toContain("WHERE is_deceased AND death_date IS NULL");
    expect(sql).toContain("summary_roots AS");
    expect(sql).toContain("SELECT id,0,ARRAY[id] FROM summary_roots");
    expect(sql).toContain("NOT relationship.child_id=ANY(walk.path)");
    expect(sql).toContain("FROM summary_walk) maximum_generation_depth");
    expect(sql).not.toContain("gender='unspecified'");
  });

  it("gates overview wife exclusion with the shared boolean parameter", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [summary], rowCount: 1 });
    await readAnalysisSummary({ query } as unknown as PoolClient, scope, true);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("WHERE NOT $4::boolean OR NOT (");
    expect(sql).toContain("JOIN scoped_members husband");
    expect(sql).toContain("family_parent.child_id=member.id");
    expect(query.mock.calls[0][1]).toEqual([scope.treeId, null, "tree", true]);
  });

  it("derives explorer branches from direct assignments and ancestry without unions", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readAnalysisMembers(
      { query } as unknown as PoolClient,
      scope,
      { filters: {}, sort: "name", direction: "asc", limit: 25 },
      null,
    );
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("branch_lineage");
    expect(sql).toContain("direct_assignment DESC");
    expect(sql).toContain("LEFT JOIN scoped_members father ON father.id=ps.father_id");
    expect(sql).toContain("LEFT JOIN parent_stats father_ps ON father_ps.child_id=father.id");
    expect(sql).toContain("grandfather.name_en grandfather_name_en");
    expect(sql).toContain(
      "LEFT JOIN parent_stats grandfather_ps ON grandfather_ps.child_id=grandfather.id",
    );
    expect(sql).toContain("great_grandfather.name_en great_grandfather_name_en");
    expect(sql).not.toContain("union_partners mine");
  });

  it("keeps one unknown-age diagnostic in branch reports", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readBranchReport({ query } as unknown as PoolClient, scope);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("unknown_age");
    expect(sql).not.toContain("missing_birth_date");
    expect(sql).not.toContain("unknown_citizenship");
    expect(sql).not.toContain("missing_name_en");
  });

  it("uses non-overlapping branch age bands split at adulthood", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readBranchReport({ query } as unknown as PoolClient, scope);
    const sql = String(query.mock.calls[0][0]);

    for (const [predicate, alias] of [
      ["m.age>=0 AND m.age<10", "age_0_9"],
      ["m.age>=10 AND m.age<18", "age_10_17"],
      ["m.age>=18 AND m.age<20", "age_18_19"],
      ["m.age>=20 AND m.age<30", "age_20_29"],
      ["m.age>=30 AND m.age<40", "age_30_39"],
      ["m.age>=40 AND m.age<50", "age_40_49"],
      ["m.age>=50 AND m.age<60", "age_50_59"],
      ["m.age>=60 AND m.age<70", "age_60_69"],
      ["m.age>=70", "age_70_plus"],
    ]) {
      expect(sql).toContain(`count(m.id) FILTER (WHERE ${predicate})::integer ${alias}`);
    }

    expect(sql).toContain("m.age>=18 AND m.age<30)::integer age_18_29");
    expect(sql).toContain("m.age>=75)::integer age_75_plus");
  });

  it("filters branch members with the same marriage-only-wife predicate", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readBranchReport({ query } as unknown as PoolClient, scope, true);
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("branch_member_ids AS");
    expect(sql).toContain("app.branch_members_for_root($1,b.id) branch_husband");
    expect(sql).toContain("wife_member.gender='female'");
    expect(sql).toContain("WHERE NOT $4::boolean AND NOT EXISTS");
    expect(sql).toContain("family_parent.child_id=wife_member.id");
    expect(sql).toContain("UNION");
    expect(sql).toContain("WHERE NOT $4::boolean OR NOT (");
    expect(sql).toContain("JOIN scoped_members husband");
    expect(query.mock.calls[0][1]).toEqual([scope.treeId, null, "tree", true]);
  });
});

describe("analysis member repository query", () => {
  it("serializes dates and calculates generation for ordinary explorer pages", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readAnalysisMembers(
      { query } as unknown as PoolClient,
      scope,
      { filters: {}, sort: "name", direction: "asc", limit: 100 },
      null,
    );
    const sql = String(query.mock.calls[0][0]);
    const values = query.mock.calls[0][1] as unknown[];

    expect(sql).toContain("birth_date::text birth_date");
    expect(sql).toContain("death_date::text death_date");
    expect(sql).toContain("SELECT s.id,0,ARRAY[s.id] FROM scoped_ids s");
    expect(sql).not.toContain("WHERE $4::boolean");
    expect(values).toEqual([scope.treeId, null, "tree", 101]);
  });

  it("keeps generation filters parameterized after removing the calculation gate", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readAnalysisMembers(
      { query } as unknown as PoolClient,
      scope,
      {
        filters: { minGeneration: 2, maxGeneration: 4 },
        sort: "generation",
        direction: "desc",
        limit: 25,
      },
      null,
    );
    const sql = String(query.mock.calls[0][0]);
    const values = query.mock.calls[0][1] as unknown[];

    expect(sql).toContain("generation>=$4::integer");
    expect(sql).toContain("generation<=$5::integer");
    expect(sql).toContain("ORDER BY generation DESC NULLS LAST,id DESC");
    expect(values).toEqual([scope.treeId, null, "tree", 2, 4, 26]);
  });

  it("applies wife exclusion to the shared explorer and export query", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await readAnalysisMembers(
      { query } as unknown as PoolClient,
      scope,
      { filters: { excludeWives: true }, sort: "name", direction: "asc", limit: 25 },
      null,
    );
    const sql = String(query.mock.calls[0][0]);

    expect(sql).toContain("SELECT * FROM base member WHERE NOT (");
    expect(sql).toContain("JOIN scoped_members husband");
    expect(sql).toContain("NOT EXISTS");
  });
});
