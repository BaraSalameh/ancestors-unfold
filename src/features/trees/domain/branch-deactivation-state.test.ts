import { describe, expect, it } from "vitest";
import { branchDeactivationActionState } from "./branch-deactivation-state";

describe("branch deactivation pending actions", () => {
  it("shows a spinner only for the action currently running", () => {
    expect(branchDeactivationActionState("request")).toEqual({
      busy: true,
      requestLoading: true,
      confirmLoading: false,
    });
    expect(branchDeactivationActionState("confirm")).toEqual({
      busy: true,
      requestLoading: false,
      confirmLoading: true,
    });
  });
});
