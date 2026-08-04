export type BranchDeactivationPendingAction = "request" | "confirm" | null;

export function branchDeactivationActionState(action: BranchDeactivationPendingAction) {
  return {
    busy: action !== null,
    requestLoading: action === "request",
    confirmLoading: action === "confirm",
  };
}
