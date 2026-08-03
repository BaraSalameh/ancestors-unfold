import type { PoolClient } from "pg";
import type {
  AnalysisMember,
  AnalysisQueryDefinition,
  AnalysisScope,
  SummaryData,
} from "../domain/types";
import type { MemberPageInput } from "../domain/schemas";
import type { AnalysisCursor } from "../domain/projection";
import { addAnalysisSqlValue as addValue, memberFilterSql as filterSql } from "./member-filter-sql";

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
): Promise<SummaryData> {
  const result = await client.query<SummaryData>(
    `WITH ${scopedMembersCte}, totals AS (
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
      FROM scoped_members
    ), living_age_stats AS (
      SELECT max((lifecycle_age/10)*10)::integer max_band,
        count(*) FILTER (WHERE lifecycle_age IS NULL)::integer unknown_count
      FROM scoped_members WHERE NOT is_deceased
    ), age_bands AS (
      SELECT band::text key,
        count(m.id) FILTER (WHERE (m.lifecycle_age/10)*10=band)::integer count,
        band sort_order
      FROM living_age_stats stats
      CROSS JOIN LATERAL generate_series(0,stats.max_band,10) band
      LEFT JOIN scoped_members m ON NOT m.is_deceased AND m.lifecycle_age IS NOT NULL
      GROUP BY band
      UNION ALL
      SELECT 'unknown',unknown_count,2147483647 FROM living_age_stats
    ), birth_decades AS (
      SELECT ((extract(year FROM birth_date)::integer/10)*10)::text key,count(*)::integer count
      FROM scoped_members WHERE birth_date IS NOT NULL GROUP BY 1 ORDER BY 1
    ), death_decades AS (
      SELECT ((extract(year FROM death_date)::integer/10)*10)::text key,count(*)::integer count
      FROM scoped_members WHERE death_date IS NOT NULL GROUP BY 1 ORDER BY 1
    )
    SELECT t.*,
      (SELECT jsonb_build_object('id',id,'name_en',coalesce(name_en,''),'name_ar',coalesce(name_ar,''),'age',lifecycle_age)
       FROM scoped_members WHERE NOT is_deceased AND lifecycle_age IS NOT NULL
       ORDER BY lifecycle_age DESC,id LIMIT 1) oldest_member,
      (SELECT jsonb_build_object('id',id,'name_en',coalesce(name_en,''),'name_ar',coalesce(name_ar,''),'age',lifecycle_age)
       FROM scoped_members WHERE lifecycle_age IS NOT NULL ORDER BY lifecycle_age,id LIMIT 1) youngest_member,
      coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'count',count) ORDER BY sort_order) FROM age_bands),'[]') age_bands,
      coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'count',count) ORDER BY key) FROM birth_decades),'[]') birth_decades,
      coalesce((SELECT jsonb_agg(jsonb_build_object('key',key,'count',count) ORDER BY key) FROM death_decades),'[]') death_decades
    FROM totals t`,
    scopeValues(scope),
  );
  return result.rows[0];
}

const memberAnalysisCtes = `
  ${scopedMembersCte},
  branch_tree(id,name_en,name_ar,parent_subfamily_id,linked_male_id,depth) AS (
    SELECT b.id,b.name_en,b.name_ar,b.parent_subfamily_id,b.linked_male_id,0
    FROM app.subfamilies b
    WHERE b.tree_id=$1 AND b.deleted_at IS NULL AND b.parent_subfamily_id IS NULL
    UNION ALL
    SELECT b.id,b.name_en,b.name_ar,b.parent_subfamily_id,b.linked_male_id,parent.depth+1
    FROM app.subfamilies b JOIN branch_tree parent ON parent.id=b.parent_subfamily_id
    WHERE b.tree_id=$1 AND b.deleted_at IS NULL
  ), branch_lineage(branch_id,member_id,path) AS (
    SELECT id,linked_male_id,ARRAY[linked_male_id]
    FROM branch_tree WHERE linked_male_id IS NOT NULL
    UNION ALL
    SELECT lineage.branch_id,relationship.child_id,lineage.path||relationship.child_id
    FROM branch_lineage lineage
    JOIN app.parent_child_relationships relationship ON relationship.parent_id=lineage.member_id
    WHERE relationship.tree_id=$1 AND relationship.deleted_at IS NULL
      AND NOT relationship.child_id=ANY(lineage.path)
  ), branch_candidates AS (
    SELECT member.id member_id,branch.id branch_id,branch.name_en,branch.name_ar,
      branch.depth,true direct_assignment
    FROM scoped_members member JOIN branch_tree branch ON branch.id=member.subfamily_id
    UNION
    SELECT lineage.member_id,branch.id,branch.name_en,branch.name_ar,
      branch.depth,false direct_assignment
    FROM branch_lineage lineage JOIN branch_tree branch ON branch.id=lineage.branch_id
    JOIN scoped_ids scoped ON scoped.id=lineage.member_id
  ), ranked_branches AS (
    SELECT *,row_number() OVER (
      PARTITION BY member_id ORDER BY direct_assignment DESC,depth DESC,branch_id
    ) branch_rank
    FROM branch_candidates
  ), branch_assignment AS (
    SELECT member_id,branch_id,name_en,name_ar FROM ranked_branches WHERE branch_rank=1
  ),
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
    WHERE $4::boolean AND NOT EXISTS (
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
  const needsGeneration =
    exportLimit !== undefined ||
    input.sort === "generation" ||
    input.filters.minGeneration !== undefined ||
    input.filters.maxGeneration !== undefined;
  const values: unknown[] = [...scopeValues(scope), needsGeneration];
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

export async function readBranchReport(client: PoolClient, scope: AnalysisScope) {
  const result = await client.query(
    `WITH branches AS (
       SELECT b.id,b.name_en,b.name_ar FROM app.subfamilies b
       WHERE b.tree_id=$1 AND b.deleted_at IS NULL AND ($2::uuid IS NULL OR b.id=$2)
     ), members AS (
       SELECT b.id branch_id,m.*,
         CASE WHEN m.birth_date IS NULL OR (m.is_deceased AND m.death_date IS NULL) THEN NULL
           ELSE extract(year FROM age(
             CASE WHEN m.is_deceased THEN m.death_date ELSE current_date END,m.birth_date
           ))::integer END age,
         EXISTS (SELECT 1 FROM app.parent_child_relationships r
           WHERE r.tree_id=$1 AND r.child_id=m.id AND r.deleted_at IS NULL) has_parent
       FROM branches b CROSS JOIN LATERAL app.branch_members_for_root($1,b.id) bm
       JOIN app.family_members m ON m.id=bm.member_id AND m.tree_id=$1 AND m.deleted_at IS NULL
     )
     SELECT b.id,b.name_en,b.name_ar,count(m.id)::integer total,
       count(m.id) FILTER (WHERE NOT m.is_deceased)::integer living,
       count(m.id) FILTER (WHERE m.is_deceased)::integer deceased,
       count(m.id) FILTER (WHERE m.gender='male')::integer male,
       count(m.id) FILTER (WHERE m.gender='female')::integer female,
       count(m.id) FILTER (WHERE m.age>=18)::integer adults,
       count(m.id) FILTER (WHERE m.age<18)::integer minors,
       count(m.id) FILTER (WHERE m.age IS NULL)::integer unknown_age,
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
    [scope.treeId, scope.kind === "branch" ? scope.branchId : null],
  );
  return result.rows;
}

export async function readRelationshipReport(client: PoolClient, scope: AnalysisScope) {
  const result = await client.query(
    `WITH RECURSIVE ${scopedMembersCte}, parents AS (
       SELECT r.child_id,count(*)::integer count FROM app.parent_child_relationships r
       JOIN scoped_ids c ON c.id=r.child_id JOIN scoped_ids p ON p.id=r.parent_id
       WHERE r.tree_id=$1 AND r.deleted_at IS NULL GROUP BY r.child_id
     ), children AS (
       SELECT r.parent_id,count(*)::integer count FROM app.parent_child_relationships r
       JOIN scoped_ids p ON p.id=r.parent_id JOIN scoped_ids c ON c.id=r.child_id
       WHERE r.tree_id=$1 AND r.deleted_at IS NULL GROUP BY r.parent_id
     ), roots AS (
       SELECT id FROM scoped_ids WHERE id NOT IN (SELECT child_id FROM parents)
     ), walk(member_id,depth,path) AS (
       SELECT id,0,ARRAY[id] FROM roots UNION ALL
       SELECT r.child_id,w.depth+1,w.path||r.child_id FROM walk w
       JOIN app.parent_child_relationships r ON r.parent_id=w.member_id
       JOIN scoped_ids c ON c.id=r.child_id
       WHERE r.tree_id=$1 AND r.deleted_at IS NULL AND w.depth<100 AND NOT r.child_id=ANY(w.path)
     ), scoped_unions AS (
       SELECT u.id,u.status FROM app.unions u
       WHERE u.tree_id=$1 AND u.deleted_at IS NULL AND NOT EXISTS (
         SELECT 1 FROM app.union_partners p WHERE p.union_id=u.id
           AND p.member_id NOT IN (SELECT id FROM scoped_ids)
       )
     )
     SELECT (SELECT count(*)::integer FROM scoped_ids) total_members,
       (SELECT count(*)::integer FROM app.parent_child_relationships r
        WHERE r.tree_id=$1 AND r.deleted_at IS NULL AND r.child_id IN (SELECT id FROM scoped_ids)
          AND r.parent_id IN (SELECT id FROM scoped_ids)) parent_links,
       (SELECT count(*)::integer FROM scoped_ids WHERE id NOT IN (SELECT child_id FROM parents)) zero_parents,
       (SELECT count(*)::integer FROM parents WHERE count=1) one_parent,
       (SELECT count(*)::integer FROM parents WHERE count>=2) two_parents,
       (SELECT count(*)::integer FROM roots) roots,
       (SELECT count(*)::integer FROM scoped_ids WHERE id NOT IN (SELECT parent_id FROM children)) leaves,
       (SELECT count(*)::integer FROM scoped_ids WHERE id NOT IN (SELECT parent_id FROM children)) no_children_recorded,
       (SELECT coalesce(max(count),0)::integer FROM children) largest_recorded_child_count,
       (SELECT count(*)::integer FROM scoped_unions) unions,
       (SELECT count(*)::integer FROM scoped_unions WHERE status='current') active_unions,
       (SELECT count(*)::integer FROM scoped_unions WHERE status='divorced') divorced_unions,
       (SELECT coalesce(max(depth),0)::integer FROM walk) maximum_generation_depth`,
    scopeValues(scope),
  );
  return result.rows[0];
}
