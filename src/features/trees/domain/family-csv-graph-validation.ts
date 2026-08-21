import type { FamilyMember, SubFamily } from "@/features/members/domain";
import {
  csvError,
  validFamilyCsvDate,
  type FamilyCsvIssue,
  type PendingMember,
} from "./family-csv-contract";
import { ancestryCycleIssues } from "./family-csv-relationships";

function indexMembers(members: FamilyMember[], issues: FamilyCsvIssue[]) {
  const byId = new Map<string, FamilyMember>();
  for (const member of members) {
    if (byId.has(member.id))
      issues.push(csvError("DUPLICATE_MEMBER_ID", `Duplicate member ID: ${member.id}.`));
    byId.set(member.id, member);
    if (!member.name_en.trim() && !member.name_ar.trim())
      issues.push(csvError("NAME_REQUIRED", `Member ${member.id} requires at least one name.`));
  }
  return byId;
}

function validateParentReferences(member: FamilyMember, byId: ReadonlyMap<string, FamilyMember>) {
  const issues: FamilyCsvIssue[] = [];
  for (const [column, parentId, gender] of [
    ["father_id", member.father_id, "male"],
    ["mother_id", member.mother_id, "female"],
  ] as const) {
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent)
      issues.push(
        csvError(
          "MISSING_REFERENCE",
          `${column} references missing member ${parentId}.`,
          undefined,
          column,
        ),
      );
    else if (parent.id === member.id)
      issues.push(
        csvError(
          "SELF_PARENT",
          `Member ${member.id} cannot be their own parent.`,
          undefined,
          column,
        ),
      );
    else if (parent.gender !== gender)
      issues.push(
        csvError(
          "PARENT_GENDER",
          `${column} for ${member.id} must reference a ${gender} member.`,
          undefined,
          column,
        ),
      );
  }
  return issues;
}

function uniqueSpouseIds(member: FamilyMember) {
  return [...(member.spouse_ids ?? []), ...(member.spouse_id ? [member.spouse_id] : [])].filter(
    (id, index, all) => all.indexOf(id) === index,
  );
}

function validateSpouseReferences(member: FamilyMember, byId: ReadonlyMap<string, FamilyMember>) {
  const issues: FamilyCsvIssue[] = [];
  const spouseIds = uniqueSpouseIds(member);
  if (spouseIds.length > 100)
    issues.push(csvError("TOO_MANY_SPOUSES", `Member ${member.id} has more than 100 spouses.`));
  for (const spouseId of spouseIds) {
    const spouse = byId.get(spouseId);
    if (!spouse)
      issues.push(
        csvError(
          "MISSING_REFERENCE",
          `Spouse reference ${spouseId} does not exist.`,
          undefined,
          "spouse_ids",
        ),
      );
    else if (spouse.id === member.id)
      issues.push(
        csvError(
          "SELF_SPOUSE",
          `Member ${member.id} cannot be their own spouse.`,
          undefined,
          "spouse_ids",
        ),
      );
    else if (spouse.gender === member.gender)
      issues.push(
        csvError(
          "SPOUSE_GENDER",
          `Spouses ${member.id} and ${spouse.id} must have opposite genders.`,
          undefined,
          "spouse_ids",
        ),
      );
  }
  for (const divorcedId of member.divorced_from ?? [])
    if (!spouseIds.includes(divorcedId))
      issues.push(
        csvError(
          "DIVORCE_NOT_SPOUSE",
          `${divorcedId} is divorced from ${member.id} but is not listed as a spouse.`,
          undefined,
          "divorced_from",
        ),
      );
  return issues;
}

function validateLifeDates(member: FamilyMember) {
  const issues: FamilyCsvIssue[] = [];
  if (member.birth_date && !validFamilyCsvDate(member.birth_date))
    issues.push(
      csvError("INVALID_DATE", `Invalid birth_date for ${member.id}.`, undefined, "birth_date"),
    );
  if (member.death_date && !validFamilyCsvDate(member.death_date))
    issues.push(
      csvError("INVALID_DATE", `Invalid death_date for ${member.id}.`, undefined, "death_date"),
    );
  if (member.birth_date && member.death_date && member.death_date < member.birth_date)
    issues.push(
      csvError(
        "DEATH_BEFORE_BIRTH",
        `death_date cannot be before birth_date for ${member.id}.`,
        undefined,
        "death_date",
      ),
    );
  if (member.death_date && member.is_deceased === false)
    issues.push(
      csvError(
        "DECEASED_CONTRADICTION",
        `Member ${member.id} has a death date but is_deceased=false.`,
        undefined,
        "is_deceased",
      ),
    );
  return issues;
}

function validateBranches(subfamilies: SubFamily[], byId: ReadonlyMap<string, FamilyMember>) {
  const issues: FamilyCsvIssue[] = [];
  const branchIds = new Set<string>();
  for (const branch of subfamilies) {
    if (branchIds.has(branch.id))
      issues.push(csvError("DUPLICATE_BRANCH_ID", `Duplicate branch ID: ${branch.id}.`));
    branchIds.add(branch.id);
    const root = branch.linked_male_id ? byId.get(branch.linked_male_id) : undefined;
    if (!branch.name_en.trim() && !branch.name_ar.trim())
      issues.push(csvError("BRANCH_NAME_REQUIRED", `Branch ${branch.id} requires a name.`));
    if (!root)
      issues.push(
        csvError("MISSING_BRANCH_ROOT", `Branch ${branch.id} must reference an imported member.`),
      );
    else if (root.gender !== "male")
      issues.push(
        csvError("BRANCH_ROOT_NOT_MALE", `Branch ${branch.id} must be rooted at a male member.`),
      );
  }
  return issues;
}

export function validateFamilyImportGraph(
  members: FamilyMember[],
  subfamilies: SubFamily[],
): FamilyCsvIssue[] {
  const issues: FamilyCsvIssue[] = [];
  const byId = indexMembers(members, issues);
  for (const member of members) {
    issues.push(...validateParentReferences(member, byId));
    issues.push(...validateSpouseReferences(member, byId));
    issues.push(...validateLifeDates(member));
  }
  issues.push(...validateBranches(subfamilies, byId));
  const pending: PendingMember[] = members.map((member) => ({
    ...member,
    sourceRow: 0,
    rawSpouses: member.spouse_ids ?? (member.spouse_id ? [member.spouse_id] : []),
    rawDivorced: member.divorced_from ?? [],
  }));
  issues.push(...ancestryCycleIssues(pending));
  return issues;
}
