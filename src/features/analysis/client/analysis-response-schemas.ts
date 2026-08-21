import { z } from "zod";

const analysisScopeSchema = z.object({
  kind: z.enum(["tree", "branch"]),
  treeId: z.string(),
  treeNameEn: z.string().nullable(),
  treeNameAr: z.string().nullable(),
  branchId: z.string().nullable(),
  branchNameEn: z.string().nullable(),
  branchNameAr: z.string().nullable(),
  role: z.enum(["owner", "contributor"]),
});

export const analysisEnvelopeSchema = <Schema extends z.ZodTypeAny>(data: Schema) =>
  z.object({
    schema_version: z.literal(1),
    as_of_date: z.string(),
    scope: analysisScopeSchema,
    data,
  });

export const analysisTreeSchema = z.object({
  id: z.string(),
  name_en: z.string().nullable(),
  name_ar: z.string().nullable(),
  role: z.enum(["owner", "contributor"]),
  assigned_branch_id: z.string().nullable(),
  analysis_enabled: z.boolean(),
});

const analysisBranchSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_ar: z.string().nullable(),
});

export const analysisCatalogSchema = z.object({
  branches: z.array(analysisBranchSchema),
  filters: z.array(z.string()),
  reports: z.array(z.string()),
  export_formats: z.array(z.string()),
  maximum_page_size: z.number().int().positive(),
  maximum_export_rows: z.number().int().positive(),
});

const memberHighlightSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
  age: z.number(),
});
const distributionSchema = z.object({ key: z.string(), count: z.number() });

export const analysisSummarySchema = z.object({
  total: z.number(),
  living: z.number(),
  deceased: z.number(),
  male: z.number(),
  female: z.number(),
  adults: z.number(),
  living_adults: z.number(),
  minors: z.number(),
  unknown_age: z.number(),
  resident: z.number(),
  non_resident: z.number(),
  average_age: z.number().nullable(),
  median_age: z.number().nullable(),
  average_lifespan: z.number().nullable(),
  maximum_generation_depth: z.number(),
  oldest_member: memberHighlightSchema.nullable(),
  youngest_member: memberHighlightSchema.nullable(),
  age_bands: z.array(distributionSchema),
  birth_decades: z.array(distributionSchema),
  death_decades: z.array(distributionSchema),
});

export const relationshipReportSchema = z.object({
  total_members: z.number(),
  parent_links: z.number(),
  zero_parents: z.number(),
  one_parent: z.number(),
  two_parents: z.number(),
  roots: z.number(),
  leaves: z.number(),
  no_children_recorded: z.number(),
  largest_recorded_child_count: z.number(),
  unions: z.number(),
  active_unions: z.number(),
  divorced_unions: z.number(),
  maximum_generation_depth: z.number(),
  married_males: z.number(),
  divorced_males: z.number(),
  single_males_18_24: z.number(),
  single_males_25_plus: z.number(),
  married_males_no_children: z.number(),
});

export const qualityReportSchema = z.object({
  total: z.number(),
  missing_name_en: z.number(),
  missing_name_ar: z.number(),
  missing_birth_date: z.number(),
  missing_branch: z.number(),
  missing_image: z.number(),
  unknown_placeholders: z.number(),
  no_parents_recorded: z.number(),
  missing_parent: z.number(),
  possible_duplicate_groups: z.number(),
  contradictory_dates: z.number(),
  graph_cycles: z.number(),
});

export const branchReportRowSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_ar: z.string().nullable(),
  total: z.number(),
  living: z.number(),
  deceased: z.number(),
  male: z.number(),
  female: z.number(),
  adults: z.number(),
  minors: z.number(),
  unknown_age: z.number(),
  age_0_9: z.number(),
  age_10_17: z.number(),
  age_18_19: z.number(),
  age_20_29: z.number(),
  age_30_39: z.number(),
  age_40_49: z.number(),
  age_50_59: z.number(),
  age_60_69: z.number(),
  age_70_plus: z.number(),
  age_18_29: z.number(),
  age_30_44: z.number(),
  age_45_59: z.number(),
  age_60_74: z.number(),
  age_75_plus: z.number(),
  resident: z.number(),
  non_resident: z.number(),
  completeness_percent: z.number(),
});

const analysisMemberSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_ar: z.string(),
  father_name_en: z.string().nullable(),
  father_name_ar: z.string().nullable(),
  grandfather_name_en: z.string().nullable(),
  grandfather_name_ar: z.string().nullable(),
  great_grandfather_name_en: z.string().nullable(),
  great_grandfather_name_ar: z.string().nullable(),
  gender: z.enum(["male", "female"]),
  birth_date: z.string().nullable(),
  death_date: z.string().nullable(),
  is_deceased: z.boolean(),
  lifecycle_age: z.number().nullable(),
  citizen_status: z.enum(["resident", "non_resident"]),
  branch_id: z.string().nullable(),
  branch_name_en: z.string().nullable(),
  branch_name_ar: z.string().nullable(),
  father_id: z.string().nullable(),
  mother_id: z.string().nullable(),
  parent_count: z.number(),
  has_spouse: z.boolean(),
  child_count: z.number(),
  generation: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const analysisFiltersSchema = z.object({
  search: z.string().optional(),
  genders: z.array(z.enum(["male", "female"])).optional(),
  lifeStatus: z.enum(["living", "deceased"]).optional(),
  citizenStatuses: z.array(z.enum(["resident", "non_resident"])).optional(),
  branchIds: z.array(z.string()).optional(),
  minAge: z.number().optional(),
  maxAge: z.number().optional(),
  birthFrom: z.string().optional(),
  birthTo: z.string().optional(),
  deathFrom: z.string().optional(),
  deathTo: z.string().optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  parentCount: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  excludeWives: z.boolean().optional(),
  hasSpouse: z.boolean().optional(),
  hasChildren: z.boolean().optional(),
  minChildren: z.number().optional(),
  maxChildren: z.number().optional(),
  minGeneration: z.number().optional(),
  maxGeneration: z.number().optional(),
  missingFields: z
    .array(z.enum(["name_en", "name_ar", "birth_date", "branch", "image", "parent"]))
    .optional(),
});

const analysisDefinitionSchema = z.object({
  filters: analysisFiltersSchema,
  sort: z.enum([
    "name",
    "age",
    "birth_date",
    "death_date",
    "children",
    "generation",
    "created_at",
    "updated_at",
  ]),
  direction: z.enum(["asc", "desc"]),
  view: z.enum(["overview", "branches", "relationships", "quality", "explorer"]).optional(),
});

export const analysisMemberPageSchema = z.object({
  items: z.array(analysisMemberSchema),
  total: z.number(),
  applied_filters: analysisFiltersSchema,
  next_cursor: z.string().nullable(),
});

export const savedAnalysisViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  definition: analysisDefinitionSchema,
  created_at: z.string(),
  updated_at: z.string(),
  can_manage: z.boolean(),
});

export const successResponseSchema = z.object({ ok: z.literal(true) });
