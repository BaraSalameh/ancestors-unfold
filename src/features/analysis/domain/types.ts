export type AnalysisScope = {
  kind: "tree" | "branch";
  treeId: string;
  branchId: string | null;
  branchNameEn: string | null;
  branchNameAr: string | null;
  role: "owner" | "contributor";
};

export type AnalysisFilters = {
  search?: string;
  genders?: Array<"male" | "female" | "unspecified">;
  lifeStatus?: "living" | "deceased";
  citizenStatuses?: Array<"resident" | "non_resident" | "unknown">;
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
  hasSpouse?: boolean;
  hasChildren?: boolean;
  minChildren?: number;
  maxChildren?: number;
  minGeneration?: number;
  maxGeneration?: number;
  missingFields?: Array<
    "name_en" | "name_ar" | "birth_date" | "citizen_status" | "branch" | "image" | "parent"
  >;
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
  unspecified_gender: number;
  adults: number;
  minors: number;
  unknown_age: number;
  resident: number;
  non_resident: number;
  unknown_citizenship: number;
  average_age: number | null;
  median_age: number | null;
  average_lifespan: number | null;
  oldest_member: AnalysisMemberHighlight | null;
  youngest_member: AnalysisMemberHighlight | null;
  age_bands: DistributionItem[];
  birth_decades: DistributionItem[];
  death_decades: DistributionItem[];
};

export type AnalysisMemberHighlight = {
  id: string;
  name_en: string;
  name_ar: string;
  age: number;
};

export type DistributionItem = { key: string; count: number };

export type AnalysisMember = {
  id: string;
  name_en: string;
  name_ar: string;
  gender: "male" | "female" | "unspecified";
  birth_date: string | null;
  death_date: string | null;
  is_deceased: boolean;
  lifecycle_age: number | null;
  citizen_status: "resident" | "non_resident" | null;
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
};
