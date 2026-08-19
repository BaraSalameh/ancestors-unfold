import { describe, expect, it } from "vitest";
import {
  authenticityLevels,
  authenticityRequirementStates,
  authenticityStepStatus,
  type AuthenticityProgressMetrics,
} from "./authenticity-progress";

describe("authenticity progress", () => {
  it("marks earlier levels completed, the earned level current, and later levels upcoming", () => {
    expect(
      authenticityLevels.map((level) => authenticityStepStatus(level, "family_backed")),
    ).toEqual(["completed", "completed", "current", "upcoming"]);
  });

  it("keeps established as the current terminal level", () => {
    expect(authenticityLevels.map((level) => authenticityStepStatus(level, "established"))).toEqual(
      ["completed", "completed", "completed", "current"],
    );
  });

  it("starts a new tree with every later level upcoming", () => {
    expect(authenticityLevels.map((level) => authenticityStepStatus(level, "new"))).toEqual([
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("evaluates every configured requirement at its exact threshold", () => {
    const metrics: AuthenticityProgressMetrics = {
      activeContributors: 8,
      managedBranches: 5,
      treeAgeDays: 365,
      recentActivityMet: true,
      growingContributors: 2,
      growingBranches: 2,
      backedContributors: 4,
      backedBranches: 3,
      establishedContributors: 8,
      establishedBranches: 5,
      establishedMinDays: 365,
    };
    expect(authenticityRequirementStates(metrics)).toEqual({
      new: [true],
      growing: [true, true],
      family_backed: [true, true],
      established: [true, true, true, true],
    });
  });

  it("reports partial progress independently for upcoming requirements", () => {
    expect(
      authenticityRequirementStates({
        activeContributors: 4,
        managedBranches: 2,
        treeAgeDays: 364,
        recentActivityMet: false,
        growingContributors: 2,
        growingBranches: 2,
        backedContributors: 4,
        backedBranches: 3,
        establishedContributors: 8,
        establishedBranches: 5,
        establishedMinDays: 365,
      }),
    ).toEqual({
      new: [true],
      growing: [true, true],
      family_backed: [true, false],
      established: [false, false, false, false],
    });
  });
});
