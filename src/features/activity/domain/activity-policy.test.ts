import { describe, expect, it } from "vitest";
import { activityRequestLimit } from "./activity-policy";

describe("activityRequestLimit", () => {
  it("bounds requested page sizes and defaults malformed values", () => {
    expect(activityRequestLimit("1")).toBe(1);
    expect(activityRequestLimit("500")).toBe(100);
    expect(activityRequestLimit("0")).toBe(1);
    expect(activityRequestLimit("invalid")).toBe(25);
    expect(activityRequestLimit("5x")).toBe(25);
    expect(activityRequestLimit(null)).toBe(25);
  });
});
