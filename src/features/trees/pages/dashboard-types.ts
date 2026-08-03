import type { ActivityItem } from "../domain/activity-label";
import type { AuthenticityLevel, EarnedAuthenticityLevel } from "../domain/authenticity-progress";

export interface CurrentTree {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  created_at: string;
  role: "owner" | "contributor";
  affiliation_status: "active" | "read_only" | "removed";
  assigned_branch_id: string | null;
  analysis_enabled?: boolean;
}

export interface Statistics {
  total_members: number;
  active_contributors: number;
  managed_branches: number;
  total_branches: number;
  serious_complaints: number;
  authenticity_level: AuthenticityLevel;
  earned_authenticity_level: EarnedAuthenticityLevel;
  growing_contributors: number;
  growing_branches: number;
  backed_contributors: number;
  backed_branches: number;
  established_contributors: number;
  established_branches: number;
  established_min_days: number;
  recent_activity_days: number;
  tree_age_days: number;
  recent_activity_met: boolean;
  tree_created_at: string;
  last_contribution_at: string | null;
  owner_name_en: string;
  owner_name_ar: string;
}

export interface Branch {
  id: string;
  name_en: string;
  name_ar: string | null;
  status: string;
  contributor_user_id: string | null;
  contributor_name_en: string | null;
  contributor_name_ar: string | null;
}

export interface Invitation {
  id: string;
  invited_name_en: string;
  invited_name_ar: string;
  invited_email: string;
  status: string;
  expires_at: string;
  branch_name_en: string;
  branch_name_ar: string | null;
}

export interface OwnershipTransfer {
  id: string;
  tree_id: string;
  tree_name_en: string | null;
  tree_name_ar: string | null;
  current_owner_user_id: string;
  proposed_owner_user_id: string;
  current_owner_name_en: string;
  current_owner_name_ar: string;
  proposed_owner_name_en: string;
  proposed_owner_name_ar: string;
  branch_id: string;
  branch_name_en: string;
  branch_name_ar: string | null;
  verified: boolean;
  status: "pending";
  verification_expires_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface DashboardData {
  tree: CurrentTree;
  stats: Statistics;
  branches: Branch[];
  invitations: Invitation[];
  activity: ActivityItem[];
  ownershipTransfer: OwnershipTransfer | null;
}

export interface DashboardQualityInsights {
  total: number;
  missing_name_en: number;
  missing_name_ar: number;
  missing_birth_date: number;
  missing_citizenship: number;
  missing_branch: number;
  missing_image: number;
  unknown_placeholders: number;
  no_parents_recorded: number;
  possible_duplicate_groups: number;
  contradictory_dates: number;
  graph_cycles: number;
}

export interface DashboardBranchHealth {
  id: string;
  name_en: string;
  name_ar: string | null;
  total: number;
  completeness_percent: number;
}

export interface DashboardInsights {
  quality?: DashboardQualityInsights;
  branches: DashboardBranchHealth[];
  loading: boolean;
  error: boolean;
  retry: () => void;
}

export interface SearchOption {
  id: string;
  name_en: string | null;
  name_ar: string | null;
  birth_year?: number | null;
}
