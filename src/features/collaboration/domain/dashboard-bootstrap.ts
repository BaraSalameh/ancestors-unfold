import { z } from "zod";
import { activityItemSchema } from "@/features/activity/domain";

const dateStringSchema = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string(),
);

const statisticsSchema = z.object({
  total_members: z.number(),
  active_contributors: z.number(),
  managed_branches: z.number(),
  total_branches: z.number(),
  serious_complaints: z.number(),
  authenticity_level: z.enum(["new", "growing", "family_backed", "established", "under_review"]),
  earned_authenticity_level: z.enum(["new", "growing", "family_backed", "established"]),
  growing_contributors: z.number(),
  growing_branches: z.number(),
  backed_contributors: z.number(),
  backed_branches: z.number(),
  established_contributors: z.number(),
  established_branches: z.number(),
  established_min_days: z.number(),
  recent_activity_days: z.number(),
  tree_age_days: z.number(),
  recent_activity_met: z.boolean(),
  tree_created_at: dateStringSchema,
  last_contribution_at: dateStringSchema.nullable(),
  owner_name_en: z.string(),
  owner_name_ar: z.string(),
});

const branchSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_ar: z.string().nullable(),
  root_family_member_id: z.string().nullable(),
  parent_branch_id: z.string().nullable(),
  status: z.string(),
  member_ids: z.array(z.string()),
  member_count: z.number(),
  contributor_user_id: z.string().nullable(),
  contributor_name_en: z.string().nullable(),
  contributor_name_ar: z.string().nullable(),
  contributor_email: z.string().nullable(),
});

const invitationSchema = z.object({
  id: z.string(),
  branch_id: z.string(),
  invited_name_en: z.string(),
  invited_name_ar: z.string(),
  invited_email: z.string(),
  status: z.string(),
  expires_at: dateStringSchema,
  branch_name_en: z.string(),
  branch_name_ar: z.string().nullable(),
});

const ownershipTransferSchema = z.object({
  id: z.string(),
  tree_id: z.string(),
  tree_name_en: z.string().nullable(),
  tree_name_ar: z.string().nullable(),
  current_owner_user_id: z.string(),
  proposed_owner_user_id: z.string(),
  current_owner_name_en: z.string(),
  current_owner_name_ar: z.string(),
  proposed_owner_name_en: z.string(),
  proposed_owner_name_ar: z.string(),
  branch_id: z.string(),
  branch_name_en: z.string(),
  branch_name_ar: z.string().nullable(),
  verified: z.boolean(),
  status: z.literal("pending"),
  verification_expires_at: dateStringSchema.nullable(),
  expires_at: dateStringSchema,
  created_at: dateStringSchema,
});

const qualitySchema = z.object({
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

const branchHealthSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_ar: z.string().nullable(),
  total: z.number(),
  completeness_percent: z.number(),
});

export const dashboardBootstrapSchema = z.object({
  locale: z.enum(["en", "ar"]),
  tree: z.object({
    id: z.string(),
    name_en: z.string().nullable(),
    name_ar: z.string().nullable(),
    description_en: z.string().nullable(),
    description_ar: z.string().nullable(),
    country_code: z.string().nullable(),
    visibility: z.enum(["private", "public"]),
    created_at: dateStringSchema,
    version: z.number(),
    role: z.enum(["owner", "contributor"]),
    affiliation_status: z.enum(["active", "read_only", "removed"]),
    assigned_branch_id: z.string().nullable(),
    analysis_enabled: z.boolean(),
  }),
  statistics: statisticsSchema,
  branches: z.array(branchSchema),
  activity: z.array(activityItemSchema),
  invitations: z.array(invitationSchema),
  ownershipTransfer: ownershipTransferSchema.nullable(),
  insights: z.object({
    quality: qualitySchema.optional(),
    branches: z.array(branchHealthSchema),
  }),
});

export type DashboardBootstrap = z.infer<typeof dashboardBootstrapSchema>;
