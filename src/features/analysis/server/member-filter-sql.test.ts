import { describe, expect, it } from "vitest";
import { memberFilterSql } from "./member-filter-sql";

describe("analysis member filter SQL", () => {
  it("excludes only marriage-only wives when requested", () => {
    const sql = memberFilterSql({ excludeWives: true }, []);

    expect(sql).toContain("member.gender='female'");
    expect(sql).toContain("JOIN scoped_members husband");
    expect(sql).toContain("husband.gender='male'");
    expect(sql).toContain("wife.member_id=member.id");
    expect(sql).toContain("family_parent.child_id=member.id");
    expect(sql).toContain("family_parent.deleted_at IS NULL");
    expect(sql).toMatch(/^WHERE NOT \(/);
  });

  it("does not add wife filtering when the option is absent or false", () => {
    expect(memberFilterSql({}, [])).toBe("");
    expect(memberFilterSql({ excludeWives: false }, [])).toBe("");
  });

  it("combines wife exclusion with parameterized filters", () => {
    const values: unknown[] = [];
    const sql = memberFilterSql({ genders: ["female"], excludeWives: true }, values);

    expect(sql).toContain("gender=ANY($1::app.gender[])");
    expect(sql).toContain(" AND NOT (");
    expect(values).toEqual([["female"]]);
  });

  it("does not list wives with male spouses as missing a branch", () => {
    const sql = memberFilterSql({ missingFields: ["branch"] }, []);

    expect(sql).toContain("branch_id IS NULL");
    expect(sql).toContain("member.gender='female'");
    expect(sql).toContain("JOIN app.family_members husband");
    expect(sql).toContain("husband.gender='male'");
    expect(sql).toContain("wife.member_id=member.id");
  });
});
