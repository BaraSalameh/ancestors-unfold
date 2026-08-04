export type AnalysisScope = {
  kind: "tree" | "branch";
  treeId: string;
  treeNameEn: string | null;
  treeNameAr: string | null;
  branchId: string | null;
  branchNameEn: string | null;
  branchNameAr: string | null;
  role: "owner" | "contributor";
};

export type AnalysisFilters = {
  search?: string;
  genders?: Array<"male" | "female">;
  lifeStatus?: "living" | "deceased";
  citizenStatuses?: Array<"resident" | "non_resident">;
  branchIds?: string[];
  minAge?: number;
  maxAge?: number;
  birthFrom?: string;
  birthTo?: string;
  deathFrom?: string;
  deathTo?: string;
  createdFrom?: string;
  createdTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  parentCount?: 0 | 1 | 2;
  excludeWives?: boolean;
  hasSpouse?: boolean;
  hasChildren?: boolean;
  minChildren?: number;
  maxChildren?: number;
  minGeneration?: number;
  maxGeneration?: number;
  missingFields?: Array<"name_en" | "name_ar" | "birth_date" | "branch" | "image" | "parent">;
};

export type AnalysisSort =
  | "name"
  | "age"
  | "birth_date"
  | "death_date"
  | "children"
  | "generation"
  | "created_at"
  | "updated_at";

export type AnalysisQueryDefinition = {
  filters: AnalysisFilters;
  sort: AnalysisSort;
  direction: "asc" | "desc";
  view?: "overview" | "branches" | "relationships" | "quality" | "explorer";
};

export type AnalysisBranch = {
  id: string;
  name_en: string;
  name_ar: string | null;
};

export type AnalysisEnvelope<T> = {
  schema_version: 1;
  as_of_date: string;
  scope: AnalysisScope;
  data: T;
};

export type SummaryData = {
  total: number;
  living: number;
  deceased: number;
  male: number;
  female: number;
  adults: number;
  living_adults: number;
  minors: number;
  unknown_age: number;
  resident: number;
  non_resident: number;
  average_age: number | null;
  median_age: number | null;
  average_lifespan: number | null;
  maximum_generation_depth: number;
  oldest_member: AnalysisMemberHighlight | null;
  youngest_member: AnalysisMemberHighlight | null;
  age_bands: DistributionItem[];
  birth_decades: DistributionItem[];
  death_decades: DistributionItem[];
};

export type RelationshipReportData = {
  total_members: number;
  parent_links: number;
  zero_parents: number;
  one_parent: number;
  two_parents: number;
  roots: number;
  leaves: number;
  no_children_recorded: number;
  largest_recorded_child_count: number;
  unions: number;
  active_unions: number;
  divorced_unions: number;
  maximum_generation_depth: number;
  married_males: number;
  divorced_males: number;
  single_males_18_24: number;
  single_males_25_plus: number;
  married_males_no_children: number;
};

export type QualityReportData = {
  total: number;
  missing_name_en: number;
  missing_name_ar: number;
  missing_birth_date: number;
  missing_citizenship: number;
  missing_branch: number;
  missing_image: number;
  unknown_placeholders: number;
  no_parents_recorded: number;
  missing_parent: number;
  possible_duplicate_groups: number;
  contradictory_dates: number;
  graph_cycles: number;
};

export type AnalysisMemberHighlight = {
  id: string;
  name_en: string;
  name_ar: string;
  age: number;
};

export type DistributionItem = { key: string; count: number };

export type BranchReportRow = {
  id: string;
  name_en: string;
  name_ar: string | null;
  total: number;
  living: number;
  deceased: number;
  male: number;
  female: number;
  adults: number;
  minors: number;
  unknown_age: number;
  age_0_9: number;
  age_10_17: number;
  age_18_19: number;
  age_20_29: number;
  age_30_39: number;
  age_40_49: number;
  age_50_59: number;
  age_60_69: number;
  age_70_plus: number;
  age_18_29: number;
  age_30_44: number;
  age_45_59: number;
  age_60_74: number;
  age_75_plus: number;
  resident: number;
  non_resident: number;
  completeness_percent: number;
};

export type AnalysisMember = {
  id: string;
  name_en: string;
  name_ar: string;
  father_name_en: string | null;
  father_name_ar: string | null;
  grandfather_name_en: string | null;
  grandfather_name_ar: string | null;
  great_grandfather_name_en: string | null;
  great_grandfather_name_ar: string | null;
  gender: "male" | "female";
  birth_date: string | null;
  death_date: string | null;
  is_deceased: boolean;
  lifecycle_age: number | null;
  citizen_status: "resident" | "non_resident";
  branch_id: string | null;
  branch_name_en: string | null;
  branch_name_ar: string | null;
  father_id: string | null;
  mother_id: string | null;
  parent_count: number;
  has_spouse: boolean;
  child_count: number;
  generation: number | null;
  created_at: string;
  updated_at: string;
};

export type SavedAnalysisView = {
  id: string;
  name: string;
  definition: AnalysisQueryDefinition;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
};
