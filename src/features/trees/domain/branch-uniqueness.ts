export type BranchUniquenessInput = {
  id: string;
  name_en: string;
  name_ar?: string | null;
  linked_male_id?: string | null;
};

export type BranchConflict = {
  code: "DUPLICATE_BRANCH_NAME" | "DUPLICATE_BRANCH_ROOT";
  column: "branch_name_en" | "branch_name_ar" | "linked_male_id";
  key: string;
  branchIds: [string, string];
};

function normalizedEnglish(value: string) {
  return value.trim().toLowerCase();
}

function normalizedArabic(value?: string | null) {
  return value?.trim() || undefined;
}

function pairKey(kind: string, value: string, left: string, right: string) {
  const [first, second] = [left, right].sort();
  return JSON.stringify([kind, value, first, second]);
}

export function branchConflicts(branches: readonly BranchUniquenessInput[]): BranchConflict[] {
  const conflicts: BranchConflict[] = [];
  const seenEnglish = new Map<string, string[]>();
  const seenArabic = new Map<string, string[]>();
  const seenRoots = new Map<string, string[]>();

  for (const branch of branches) {
    collectConflict(
      conflicts,
      seenEnglish,
      normalizedEnglish(branch.name_en),
      branch.id,
      "name_en",
    );
    const arabic = normalizedArabic(branch.name_ar);
    if (arabic) collectConflict(conflicts, seenArabic, arabic, branch.id, "name_ar");
    if (branch.linked_male_id)
      collectConflict(conflicts, seenRoots, branch.linked_male_id, branch.id, "root");
  }
  return conflicts;
}

function collectConflict(
  conflicts: BranchConflict[],
  seen: Map<string, string[]>,
  value: string,
  branchId: string,
  kind: "name_en" | "name_ar" | "root",
) {
  const priorIds = seen.get(value);
  if (!priorIds) {
    seen.set(value, [branchId]);
    return;
  }
  for (const priorId of priorIds) {
    const branchIds = [priorId, branchId].sort() as [string, string];
    conflicts.push({
      code: kind === "root" ? "DUPLICATE_BRANCH_ROOT" : "DUPLICATE_BRANCH_NAME",
      column:
        kind === "root"
          ? "linked_male_id"
          : kind === "name_ar"
            ? "branch_name_ar"
            : "branch_name_en",
      key: pairKey(kind, value, priorId, branchId),
      branchIds,
    });
  }
  priorIds.push(branchId);
}

export function newBranchConflicts(
  current: readonly BranchUniquenessInput[],
  next: readonly BranchUniquenessInput[],
): BranchConflict[] {
  const grandfathered = new Set(branchConflicts(current).map(({ key }) => key));
  return branchConflicts(next).filter(({ key }) => !grandfathered.has(key));
}
