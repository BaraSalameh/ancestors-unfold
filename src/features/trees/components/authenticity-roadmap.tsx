import { Check, Circle } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { useI18n } from "@/shared/i18n";
import {
  authenticityLevels,
  authenticityRequirementStates,
  authenticityStepStatus,
  type EarnedAuthenticityLevel,
} from "../domain/authenticity-progress";
import type { Statistics } from "../pages/dashboard-types";

type Translator = ReturnType<typeof useI18n>["t"];
type Requirement = { label: string; met: boolean };

function progressRequirement(
  t: Translator,
  kind: "contributor" | "branch",
  current: number,
  required: number,
  met: boolean,
): Requirement {
  const key =
    kind === "contributor"
      ? required === 1
        ? "authenticity_contributor_progress"
        : "authenticity_contributors_progress"
      : required === 1
        ? "authenticity_branch_progress"
        : "authenticity_branches_progress";
  return { label: t(key, { current, required }), met };
}

function roadmapRequirements(stats: Statistics, t: Translator) {
  const states = authenticityRequirementStates({
    activeContributors: stats.active_contributors,
    managedBranches: stats.managed_branches,
    treeAgeDays: stats.tree_age_days,
    recentActivityMet: stats.recent_activity_met,
    growingContributors: stats.growing_contributors,
    growingBranches: stats.growing_branches,
    backedContributors: stats.backed_contributors,
    backedBranches: stats.backed_branches,
    establishedContributors: stats.established_contributors,
    establishedBranches: stats.established_branches,
    establishedMinDays: stats.established_min_days,
  });
  return {
    new: [{ label: t("authenticity_starting_level"), met: states.new[0] }],
    growing: [
      progressRequirement(
        t,
        "contributor",
        stats.active_contributors,
        stats.growing_contributors,
        states.growing[0],
      ),
      progressRequirement(
        t,
        "branch",
        stats.managed_branches,
        stats.growing_branches,
        states.growing[1],
      ),
    ],
    family_backed: [
      progressRequirement(
        t,
        "contributor",
        stats.active_contributors,
        stats.backed_contributors,
        states.family_backed[0],
      ),
      progressRequirement(
        t,
        "branch",
        stats.managed_branches,
        stats.backed_branches,
        states.family_backed[1],
      ),
    ],
    established: [
      progressRequirement(
        t,
        "contributor",
        stats.active_contributors,
        stats.established_contributors,
        states.established[0],
      ),
      progressRequirement(
        t,
        "branch",
        stats.managed_branches,
        stats.established_branches,
        states.established[1],
      ),
      {
        label: t(
          stats.established_min_days === 1
            ? "authenticity_age_progress_one"
            : "authenticity_age_progress",
          { current: stats.tree_age_days, required: stats.established_min_days },
        ),
        met: states.established[2],
      },
      {
        label: t(
          stats.recent_activity_days === 1
            ? "authenticity_recent_activity_one"
            : "authenticity_recent_activity",
          { days: stats.recent_activity_days },
        ),
        met: states.established[3],
      },
    ],
  } satisfies Record<EarnedAuthenticityLevel, Requirement[]>;
}

function RoadmapStep({
  level,
  index,
  stats,
  requirements,
  label,
}: {
  level: EarnedAuthenticityLevel;
  index: number;
  stats: Statistics;
  requirements: Requirement[];
  label: string;
}) {
  const { t } = useI18n();
  const status = authenticityStepStatus(level, stats.earned_authenticity_level);
  const statusLabel = t(
    status === "completed"
      ? "authenticity_completed"
      : status === "current"
        ? "authenticity_current"
        : "authenticity_upcoming",
  );
  const dotClass =
    status === "completed"
      ? "border-primary bg-primary text-primary-foreground"
      : status === "current"
        ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/10"
        : "border-muted-foreground/30 bg-background text-muted-foreground";
  const cardClass =
    status === "current"
      ? "border-primary/40 bg-primary/5"
      : status === "upcoming"
        ? "border-border/70 bg-muted/20"
        : "border-border";
  return (
    <li
      className={`relative pb-4 ps-8 last:pb-0 ${index < authenticityLevels.length - 1 ? "border-s border-border" : ""}`}
    >
      <span
        className={`absolute -inset-s-3 top-0 flex h-6 w-6 items-center justify-center rounded-full border ${dotClass}`}
        aria-hidden="true"
      >
        {status === "completed" ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Circle className="h-2.5 w-2.5" fill="currentColor" />
        )}
      </span>
      <div className={`rounded-lg border p-3 ${cardClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{label}</p>
          <Badge variant={status === "current" ? "default" : "secondary"}>{statusLabel}</Badge>
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {requirements.map((requirement) => (
            <li key={requirement.label} className="flex items-start gap-1.5">
              {requirement.met ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
              )}
              <span>{requirement.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function AuthenticityRoadmap({ stats }: { stats: Statistics }) {
  const { t } = useI18n();
  const requirements = roadmapRequirements(stats, t);
  const labels: Record<EarnedAuthenticityLevel, string> = {
    new: t("new_family_tree"),
    growing: t("growing_family_tree"),
    family_backed: t("family_backed_tree"),
    established: t("established_family_tree"),
  };
  return (
    <ol className="space-y-0">
      {authenticityLevels.map((level, index) => (
        <RoadmapStep
          key={level}
          level={level}
          index={index}
          stats={stats}
          requirements={requirements[level]}
          label={labels[level]}
        />
      ))}
    </ol>
  );
}
