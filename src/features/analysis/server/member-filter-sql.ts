import type { AnalysisFilters } from "../domain/types";
import { excludeMarriageOnlyWivesSql } from "./wife-filter-sql";

export function addAnalysisSqlValue(values: unknown[], value: unknown): string {
  values.push(value);
  return `$${values.length}`;
}

function addIdentityFilters(filters: AnalysisFilters, values: unknown[], conditions: string[]) {
  if (filters.search)
    conditions.push(
      `search_name LIKE ${addAnalysisSqlValue(values, `%${filters.search.toLowerCase().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`)} ESCAPE '\\'`,
    );
  if (filters.genders?.length)
    conditions.push(`gender=ANY(${addAnalysisSqlValue(values, filters.genders)}::app.gender[])`);
  if (filters.lifeStatus)
    conditions.push(filters.lifeStatus === "living" ? "NOT is_deceased" : "is_deceased");
  if (filters.citizenStatuses?.length)
    conditions.push(
      `citizen_status::text=ANY(${addAnalysisSqlValue(values, filters.citizenStatuses)}::text[])`,
    );
  if (filters.branchIds?.length)
    conditions.push(`branch_id=ANY(${addAnalysisSqlValue(values, filters.branchIds)}::uuid[])`);
}

function addAgeAndDateFilters(filters: AnalysisFilters, values: unknown[], conditions: string[]) {
  if (filters.minAge !== undefined)
    conditions.push(`lifecycle_age>=${addAnalysisSqlValue(values, filters.minAge)}::integer`);
  if (filters.maxAge !== undefined)
    conditions.push(`lifecycle_age<=${addAnalysisSqlValue(values, filters.maxAge)}::integer`);
  for (const [field, value, operator, cast] of [
    ["birth_date", filters.birthFrom, ">=", "date"],
    ["birth_date", filters.birthTo, "<=", "date"],
    ["death_date", filters.deathFrom, ">=", "date"],
    ["death_date", filters.deathTo, "<=", "date"],
    ["created_at", filters.createdFrom, ">=", "timestamptz"],
    ["created_at", filters.createdTo, "<=", "timestamptz"],
    ["updated_at", filters.updatedFrom, ">=", "timestamptz"],
    ["updated_at", filters.updatedTo, "<=", "timestamptz"],
  ] as const)
    if (value) conditions.push(`${field}${operator}${addAnalysisSqlValue(values, value)}::${cast}`);
}

const isWifeWithMaleSpouse = `(
  member.gender='female'
  AND EXISTS (
    SELECT 1 FROM app.union_partners wife
    JOIN app.unions marriage ON marriage.id=wife.union_id
      AND marriage.tree_id=$1 AND marriage.deleted_at IS NULL
    JOIN app.union_partners husband_link ON husband_link.union_id=wife.union_id
      AND husband_link.member_id<>wife.member_id
    JOIN app.family_members husband ON husband.id=husband_link.member_id
      AND husband.tree_id=$1 AND husband.deleted_at IS NULL AND husband.gender='male'
    WHERE wife.tree_id=$1 AND wife.member_id=member.id
  )
)`;

function addRelationshipFilters(filters: AnalysisFilters, values: unknown[], conditions: string[]) {
  if (filters.parentCount !== undefined)
    conditions.push(`parent_count=${addAnalysisSqlValue(values, filters.parentCount)}::integer`);
  if (filters.excludeWives) conditions.push(excludeMarriageOnlyWivesSql);
  if (filters.hasSpouse !== undefined)
    conditions.push(`has_spouse=${addAnalysisSqlValue(values, filters.hasSpouse)}::boolean`);
  if (filters.hasChildren !== undefined)
    conditions.push(filters.hasChildren ? "child_count>0" : "child_count=0");
  if (filters.minChildren !== undefined)
    conditions.push(`child_count>=${addAnalysisSqlValue(values, filters.minChildren)}::integer`);
  if (filters.maxChildren !== undefined)
    conditions.push(`child_count<=${addAnalysisSqlValue(values, filters.maxChildren)}::integer`);
  if (filters.minGeneration !== undefined)
    conditions.push(`generation>=${addAnalysisSqlValue(values, filters.minGeneration)}::integer`);
  if (filters.maxGeneration !== undefined)
    conditions.push(`generation<=${addAnalysisSqlValue(values, filters.maxGeneration)}::integer`);
}

function addMissingFieldFilter(filters: AnalysisFilters, conditions: string[]) {
  if (!filters.missingFields?.length) return;
  const map: Record<string, string> = {
    name_en: "name_en=''",
    name_ar: "name_ar=''",
    birth_date: "birth_date IS NULL",
    branch: `branch_id IS NULL AND NOT ${isWifeWithMaleSpouse}`,
    image: "image_url IS NULL",
    parent: "parent_count=0",
  };
  conditions.push(`(${filters.missingFields.map((field) => map[field]).join(" OR ")})`);
}

export function memberFilterSql(filters: AnalysisFilters, values: unknown[]): string {
  const conditions: string[] = [];
  addIdentityFilters(filters, values, conditions);
  addAgeAndDateFilters(filters, values, conditions);
  addRelationshipFilters(filters, values, conditions);
  addMissingFieldFilter(filters, conditions);
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}
