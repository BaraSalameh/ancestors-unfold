import type { PoolClient } from "pg";
import type {
  AnalysisMember,
  AnalysisQueryDefinition,
  AnalysisScope,
  BranchReportRow,
  SummaryData,
} from "../domain/types";
import type { MemberPageInput } from "../domain/schemas";
import type { AnalysisCursor } from "../domain/projection";
import { effectiveBranchAssignmentCtes } from "./branch-assignment-sql";
import { addAnalysisSqlValue as addValue, memberFilterSql as filterSql } from "./member-filter-sql";
import { excludeMarriageOnlyWivesSql } from "./wife-filter-sql";

const scopedMembersCte = `
  scoped_ids AS (
    SELECT m.id FROM app.family_members m
    WHERE m.tree_id=$1 AND m.deleted_at IS NULL AND $3::text='tree'
    UNION
    SELECT member_id FROM app.branch_members_for_root($1,$2)
    WHERE $3::text='branch'
  ), scoped_members AS (
    SELECT m.*,
      CASE WHEN m.birth_date IS NULL OR (m.is_deceased AND m.death_date IS NULL) THEN NULL
        ELSE extract(year FROM age(
          CASE WHEN m.is_deceased THEN m.death_date ELSE current_date END,m.birth_date
        ))::integer
      END lifecycle_age
    FROM app.family_members m JOIN scoped_ids s ON s.id=m.id
    WHERE m.tree_id=$1 AND m.deleted_at IS NULL
  )`;

const scopeValues = (scope: AnalysisScope) => [scope.treeId, scope.branchId, scope.kind];

export async function readAnalysisSummary(
  client: PoolClient,
  scope: AnalysisScope,
  excludeWives = false,
): Promise<SummaryData> {
  const result = await client.query<SummaryData>(
    `WITH RECURSIVE ${scopedMembersCte}, report_members AS (
      SELECT member.* FROM scoped_members member
      WHERE NOT $4::boolean OR ${excludeMarriageOnlyWivesSql}
    ), summary_ids AS (
      SELECT id FROM report_members
    ), summary_roots AS (
      SELECT member.id FROM summary_ids member
      WHERE NOT EXISTS (
        SELECT 1 FROM app.parent_child_relationships relationship
        JOIN summary_ids parent ON parent.id=relationship.parent_id
        WHERE relationship.tree_id=$1 AND relationship.child_id=member.id
          AND relationship.deleted_at IS NULL
      )
    ), summary_walk(member_id,depth,path) AS (
      SELECT id,0,ARRAY[id] FROM summary_roots
      UNION ALL
      SELECT relationship.child_id,walk.depth+1,walk.path||relationship.child_id
      FROM summary_walk walk
      JOIN app.parent_child_relationships relationship
        ON relationship.parent_id=walk.member_id
      JOIN summary_ids child ON child.id=relationship.child_id
      WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL
        AND walk.depth<100 AND NOT relationship.child_id=ANY(walk.path)
    ), totals AS (
      SELECT count(*)::integer total,
        count(*) FILTER (WHERE NOT is_deceased)::integer living,
        count(*) FILTER (WHERE is_deceased)::integer deceased,
        count(*) FILTER (WHERE NOT is_deceased AND gender='male')::integer male,
        count(*) FILTER (WHERE NOT is_deceased AND gender='female')::integer female,
        count(*) FILTER (WHERE lifecycle_age>=18)::integer adults,
        count(*) FILTER (WHERE NOT is_deceased AND lifecycle_age>=18)::integer living_adults,
        count(*) FILTER (WHERE NOT is_deceased AND lifecycle_age<18)::integer minors,
        count(*) FILTER (WHERE NOT is_deceased AND lifecycle_age IS NULL)::integer unknown_age,
        count(*) FILTER (WHERE NOT is_deceased AND citizen_status='resident')::integer resident,
        count(*) FILTER (WHERE NOT is_deceased AND citizen_status='non_resident')::integer non_resident,
        round(avg(lifecycle_age)::numeric,1)::float8 average_age,
        round((percentile_cont(0.5) WITHIN GROUP (ORDER BY lifecycle_age))::numeric,1)::float8 median_age,
        round(avg(lifecycle_age) FILTER (WHERE death_date IS NOT NULL)::numeric,1)::float8 average_lifespan
      FROM report_members
    ), living_age_stats AS (
      SELECT max((lifecycle_age/10)*10)::integer max_band,
        count(*) FILTER (WHERE lifecycle_age IS NULL)::integer unknown_count
      FROM report_members WHERE NOT is_deceased
    ), age_bands AS (
      SELECT band::text key,
        count(m.id) FILTER (WHERE (m.lifecycle_age/10)*10=band)::integer count,
        band sort_order
      FROM living_age_stats stats
      CROSS JOIN LATERAL generate_series(0,stats.max_band,10) band
      LEFT JOIN report_members m ON NOT m.is_deceased AND m.lifecycle_age IS NOT NULL
      GROUP BY band
      UNION ALL
      SELECT 'unknown',unknown_count,2147483647 FROM living_age_stats
    ), birth_decades AS (
      SELECT ((extract(year FROM birth_date)::integer/10)*10)::text key,count(*)::integer count
      FROM report_members WHERE birth_date IS NOT NULL GROUP BY 1 ORDER BY 1
    ), death_decades AS (
      SELECT ((extract(year FROM death_date)::integer/10)*10)::text key,count(*)::integer count
      FROM report_members WHERE is_deceased AND death_date IS NOT NULL GROUP BY 1
      UNION ALL
      SELECT 'unknown',count(*)::integer FROM report_members
      WHERE is_deceased AND death_date IS NULL
    )
    SELECT t.*,
      (SELECT coalesce(max(depth),0)::integer FROM summary_walk) maximum_generation_depth,
      (SELECT jsonb_build_object('id',id,'name_en',coalesce(name_en,''),'name_ar',coalesce(name_ar,''),'age',lifecycle_age)
       FROM report_members WHERE NOT is_deceased AND lifecycle_age IS NOT NULL
       ORDER BY lifecycle_age DESC,id LIMIT 1) oldest_member,
      (SELECT jsonb_build_object('id',id,'name_en',coalesce(name_en,''),'name_ar',coalesce(name_ar,''),'age',lifecycle_age)
       FROM report_members WHERE lifecycle_age IS NOT NULL ORDER BY lifecycle_age,id LIMIT 1) youngest_member,
      coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'count',count) ORDER BY sort_order) FROM age_bands),'[]') age_bands,
      coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'count',count) ORDER BY key) FROM birth_decades),'[]') birth_decades,
      coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'count',count) ORDER BY key) FROM death_decades),'[]') death_decades
    FROM totals t`,
    [...scopeValues(scope), excludeWives],
  );
  return result.rows[0];
}

const memberAnalysisCtes = `
  ${scopedMembersCte},
  ${effectiveBranchAssignmentCtes},
  parent_stats AS (
    SELECT r.child_id,count(DISTINCT r.parent_id)::integer parent_count,
      (max(r.parent_id::text) FILTER (WHERE r.parent_role='father'))::uuid father_id,
      (max(r.parent_id::text) FILTER (WHERE r.parent_role='mother'))::uuid mother_id
    FROM app.parent_child_relationships r JOIN scoped_ids c ON c.id=r.child_id
    JOIN scoped_ids p ON p.id=r.parent_id
    WHERE r.tree_id=$1 AND r.deleted_at IS NULL GROUP BY r.child_id
  ), child_stats AS (
    SELECT r.parent_id,count(DISTINCT r.child_id)::integer child_count
    FROM app.parent_child_relationships r JOIN scoped_ids p ON p.id=r.parent_id
    JOIN scoped_ids c ON c.id=r.child_id
    WHERE r.tree_id=$1 AND r.deleted_at IS NULL GROUP BY r.parent_id
  ), partner_stats AS (
    SELECT p.member_id,true has_spouse FROM app.union_partners p
    JOIN app.unions u ON u.id=p.union_id AND u.deleted_at IS NULL
    JOIN scoped_ids s ON s.id=p.member_id WHERE p.tree_id=$1 GROUP BY p.member_id
  ), generation_walk(member_id,generation,path) AS (
    SELECT s.id,0,ARRAY[s.id] FROM scoped_ids s
    WHERE NOT EXISTS (
      SELECT 1 FROM app.parent_child_relationships r JOIN scoped_ids p ON p.id=r.parent_id
      WHERE r.tree_id=$1 AND r.child_id=s.id AND r.deleted_at IS NULL
    )
    UNION ALL
    SELECT r.child_id,w.generation+1,w.path||r.child_id
    FROM generation_walk w JOIN app.parent_child_relationships r ON r.parent_id=w.member_id
    JOIN scoped_ids c ON c.id=r.child_id
    WHERE r.tree_id=$1 AND r.deleted_at IS NULL AND w.generation<100
      AND NOT r.child_id=ANY(w.path)
  ), generation_stats AS (
    SELECT member_id,max(generation)::integer generation FROM generation_walk GROUP BY member_id
  ), base AS (
    SELECT m.id,coalesce(m.name_en,'') name_en,coalesce(m.name_ar,'') name_ar,m.gender,
      father.name_en father_name_en,father.name_ar father_name_ar,
      grandfather.name_en grandfather_name_en,grandfather.name_ar grandfather_name_ar,
      great_grandfather.name_en great_grandfather_name_en,great_grandfather.name_ar great_grandfather_name_ar,
      m.birth_date,m.death_date,m.is_deceased,m.lifecycle_age,
      m.citizen_status,branch.branch_id,branch.name_en branch_name_en,branch.name_ar branch_name_ar,
      ps.father_id,ps.mother_id,coalesce(ps.parent_count,0)::integer parent_count,
      coalesce(partner.has_spouse,false) has_spouse,coalesce(cs.child_count,0)::integer child_count,
      gs.generation,m.created_at,m.updated_at,m.image_url,m.is_unknown,
      lower(coalesce(m.name_en,'')||' '||coalesce(m.name_ar,'')) search_name
    FROM scoped_members m
    LEFT JOIN branch_assignment branch ON branch.member_id=m.id
    LEFT JOIN parent_stats ps ON ps.child_id=m.id
    LEFT JOIN scoped_members father ON father.id=ps.father_id
    LEFT JOIN parent_stats father_ps ON father_ps.child_id=father.id
    LEFT JOIN scoped_members grandfather ON grandfather.id=father_ps.father_id
    LEFT JOIN parent_stats grandfather_ps ON grandfather_ps.child_id=grandfather.id LEFT JOIN scoped_members great_grandfather ON great_grandfather.id=grandfather_ps.father_id
    LEFT JOIN child_stats cs ON cs.parent_id=m.id
    LEFT JOIN partner_stats partner ON partner.member_id=m.id
    LEFT JOIN generation_stats gs ON gs.member_id=m.id
  )`;

const sortExpressions: Record<AnalysisQueryDefinition["sort"], string> = {
  name: "search_name",
  age: "lifecycle_age",
  birth_date: "birth_date",
  death_date: "death_date",
  children: "child_count",
  generation: "generation",
  created_at: "created_at",
  updated_at: "updated_at",
};

const sortCasts: Record<AnalysisQueryDefinition["sort"], string> = {
  name: "text",
  age: "integer",
  birth_date: "date",
  death_date: "date",
  children: "integer",
  generation: "integer",
  created_at: "timestamptz",
  updated_at: "timestamptz",
};

function cursorSql(cursor: AnalysisCursor | null, sort: string, values: unknown[]) {
  if (!cursor) return "";
  const operator = cursor.direction === "desc" ? "<" : ">";
  const id = addValue(values, cursor.id);
  if (cursor.value === null) return `WHERE ${sort} IS NULL AND id${operator}${id}::uuid`;
  const value = addValue(values, cursor.value);
  const cast = sortCasts[cursor.sort];
  return `WHERE ((${sort}${operator}${value}::${cast} OR (${sort}=${value}::${cast} AND id${operator}${id}::uuid)) OR ${sort} IS NULL)`;
}

type MemberPageRow = AnalysisMember & { total_count: number; cursor_value: string | null };

export async function readAnalysisMembers(
  client: PoolClient,
  scope: AnalysisScope,
  input: MemberPageInput,
  cursor: AnalysisCursor | null,
  exportLimit?: number,
) {
  const values: unknown[] = scopeValues(scope);
  const filters = filterSql(input.filters, values);
  const limit = exportLimit ?? input.limit + 1;
  const limitParam = addValue(values, limit);
  const direction = input.direction === "desc" ? "DESC" : "ASC";
  const sort = sortExpressions[input.sort];
  const cursorWhere = cursorSql(cursor, sort, values);
  const result = await client.query<MemberPageRow>(
    `WITH RECURSIVE ${memberAnalysisCtes}, filtered AS (SELECT * FROM base member ${filters})
     SELECT id,name_en,name_ar,father_name_en,father_name_ar,grandfather_name_en,
       grandfather_name_ar,great_grandfather_name_en,great_grandfather_name_ar,gender,
       birth_date::text birth_date,death_date::text death_date,is_deceased,lifecycle_age,citizen_status,
       branch_id,branch_name_en,branch_name_ar,father_id,mother_id,parent_count,has_spouse,
       child_count,generation,created_at,updated_at,${sort}::text cursor_value,
       (SELECT count(*)::integer FROM filtered) total_count
     FROM filtered ${cursorWhere} ORDER BY ${sort} ${direction} NULLS LAST,id ${direction}
     LIMIT ${limitParam}::integer`,
    values,
  );
  const total = result.rows[0]?.total_count ?? 0;
  const cursorValue =
    result.rows[Math.min(input.limit, result.rows.length) - 1]?.cursor_value ?? null;
  return {
    rows: result.rows.map(({ total_count: _total, cursor_value: _cursor, ...row }) => row),
    total,
    cursorValue,
  };
}

export async function readBranchReport(
  client: PoolClient,
  scope: AnalysisScope,
  excludeWives = false,
) {
  const result = await client.query<BranchReportRow>(
    `WITH ${scopedMembersCte}, branches AS (
       SELECT b.id,b.name_en,b.name_ar FROM app.subfamilies b
       WHERE b.tree_id=$1 AND b.deleted_at IS NULL AND ($2::uuid IS NULL OR b.id=$2)
     ), branch_member_ids AS (
       SELECT b.id branch_id,branch_member.member_id
       FROM branches b
       CROSS JOIN LATERAL app.branch_members_for_root($1,b.id) branch_member
       UNION
       SELECT b.id,wife_member.id
       FROM branches b
       CROSS JOIN LATERAL app.branch_members_for_root($1,b.id) branch_husband
       JOIN app.family_members husband ON husband.id=branch_husband.member_id
         AND husband.tree_id=$1 AND husband.deleted_at IS NULL AND husband.gender='male'
       JOIN app.union_partners husband_link ON husband_link.member_id=husband.id
         AND husband_link.tree_id=$1
       JOIN app.unions marriage ON marriage.id=husband_link.union_id
         AND marriage.tree_id=$1 AND marriage.deleted_at IS NULL
       JOIN app.union_partners wife_link ON wife_link.union_id=marriage.id
         AND wife_link.tree_id=$1 AND wife_link.member_id<>husband.id
       JOIN app.family_members wife_member ON wife_member.id=wife_link.member_id
         AND wife_member.tree_id=$1 AND wife_member.deleted_at IS NULL
         AND wife_member.gender='female'
       WHERE NOT $4::boolean AND NOT EXISTS (
         SELECT 1 FROM app.parent_child_relationships family_parent
         WHERE family_parent.tree_id=$1 AND family_parent.child_id=wife_member.id
           AND family_parent.deleted_at IS NULL
       )
     ), members AS (
       SELECT branch_member.branch_id,member.*,
         CASE WHEN member.birth_date IS NULL
             OR (member.is_deceased AND member.death_date IS NULL) THEN NULL
           ELSE extract(year FROM age(
             CASE WHEN member.is_deceased THEN member.death_date ELSE current_date END,
             member.birth_date
           ))::integer END age,
         EXISTS (SELECT 1 FROM app.parent_child_relationships r
           WHERE r.tree_id=$1 AND r.child_id=member.id AND r.deleted_at IS NULL) has_parent
       FROM branch_member_ids branch_member
       JOIN app.family_members member ON member.id=branch_member.member_id
         AND member.tree_id=$1 AND member.deleted_at IS NULL
       WHERE NOT $4::boolean OR ${excludeMarriageOnlyWivesSql}
     )
     SELECT b.id,b.name_en,b.name_ar,count(m.id)::integer total,
       count(m.id) FILTER (WHERE NOT m.is_deceased)::integer living,
       count(m.id) FILTER (WHERE m.is_deceased)::integer deceased,
       count(m.id) FILTER (WHERE m.gender='male')::integer male,
       count(m.id) FILTER (WHERE m.gender='female')::integer female,
       count(m.id) FILTER (WHERE m.age>=18)::integer adults,
       count(m.id) FILTER (WHERE m.age<18)::integer minors,
       count(m.id) FILTER (WHERE m.age IS NULL)::integer unknown_age,
       count(m.id) FILTER (WHERE m.age>=0 AND m.age<10)::integer age_0_9,
       count(m.id) FILTER (WHERE m.age>=10 AND m.age<18)::integer age_10_17,
       count(m.id) FILTER (WHERE m.age>=18 AND m.age<20)::integer age_18_19,
       count(m.id) FILTER (WHERE m.age>=20 AND m.age<30)::integer age_20_29,
       count(m.id) FILTER (WHERE m.age>=30 AND m.age<40)::integer age_30_39,
       count(m.id) FILTER (WHERE m.age>=40 AND m.age<50)::integer age_40_49,
       count(m.id) FILTER (WHERE m.age>=50 AND m.age<60)::integer age_50_59,
       count(m.id) FILTER (WHERE m.age>=60 AND m.age<70)::integer age_60_69,
       count(m.id) FILTER (WHERE m.age>=70)::integer age_70_plus,
       count(m.id) FILTER (WHERE m.age>=18 AND m.age<30)::integer age_18_29,
       count(m.id) FILTER (WHERE m.age>=30 AND m.age<45)::integer age_30_44,
       count(m.id) FILTER (WHERE m.age>=45 AND m.age<60)::integer age_45_59,
       count(m.id) FILTER (WHERE m.age>=60 AND m.age<75)::integer age_60_74,
       count(m.id) FILTER (WHERE m.age>=75)::integer age_75_plus,
       count(m.id) FILTER (WHERE m.citizen_status='resident')::integer resident,
       count(m.id) FILTER (WHERE m.citizen_status='non_resident')::integer non_resident,
       coalesce(round(avg((
         (m.age IS NOT NULL)::integer+(m.image_url IS NOT NULL)::integer+(m.has_parent)::integer
       )::numeric/3)*100),0)::integer completeness_percent
     FROM branches b LEFT JOIN members m ON m.branch_id=b.id GROUP BY b.id,b.name_en,b.name_ar
     ORDER BY total DESC,b.name_en`,
    [...scopeValues(scope), excludeWives],
  );
  return result.rows;
}
