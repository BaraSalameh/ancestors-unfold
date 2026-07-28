import { describe, expect, it } from "vitest";
import { matchingActivityActionTypes } from "./activity-search";

describe("matchingActivityActionTypes", () => {
  it("matches action identifiers and English labels", () => {
    expect(matchingActivityActionTypes("invitation sent", "en")).toContain("invitation_sent");
    expect(matchingActivityActionTypes("invited", "en")).toContain("invitation_sent");
  });

  it("matches Arabic action labels", () => {
    expect(matchingActivityActionTypes("دعا", "ar")).toContain("invitation_sent");
    expect(matchingActivityActionTypes("دعا", "en")).toContain("invitation_sent");
  });
});
