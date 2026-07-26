export const authenticityLevels = ["new", "growing", "family_backed", "established"] as const;

export type EarnedAuthenticityLevel = (typeof authenticityLevels)[number];
export type AuthenticityLevel = EarnedAuthenticityLevel | "under_review";
export type AuthenticityStepStatus = "completed" | "current" | "upcoming";

export type AuthenticityProgressMetrics = {
  activeContributors: number;
  managedBranches: number;
  treeAgeDays: number;
  recentActivityMet: boolean;
  growingContributors: number;
  growingBranches: number;
  backedContributors: number;
  backedBranches: number;
  establishedContributors: number;
  establishedBranches: number;
  establishedMinDays: number;
};

export function authenticityStepStatus(
  step: EarnedAuthenticityLevel,
  earned: EarnedAuthenticityLevel,
): AuthenticityStepStatus {
  const stepIndex = authenticityLevels.indexOf(step);
  const earnedIndex = authenticityLevels.indexOf(earned);
  if (stepIndex < earnedIndex) return "completed";
  if (stepIndex === earnedIndex) return "current";
  return "upcoming";
}

export function authenticityRequirementStates(metrics: AuthenticityProgressMetrics) {
  return {
    new: [true],
    growing: [
      metrics.activeContributors >= metrics.growingContributors,
      metrics.managedBranches >= metrics.growingBranches,
    ],
    family_backed: [
      metrics.activeContributors >= metrics.backedContributors,
      metrics.managedBranches >= metrics.backedBranches,
    ],
    established: [
      metrics.activeContributors >= metrics.establishedContributors,
      metrics.managedBranches >= metrics.establishedBranches,
      metrics.treeAgeDays >= metrics.establishedMinDays,
      metrics.recentActivityMet,
    ],
  } satisfies Record<EarnedAuthenticityLevel, boolean[]>;
}
