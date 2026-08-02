import type { FamilyMember, MemberInput } from "./types";

export type StagedSpouse = {
  key: string;
  kind: "existing" | "new" | "unknown";
  memberId?: string;
  input?: MemberInput;
  imageFile?: File;
  divorced: boolean;
  locked?: boolean;
};

export function existingStagedSpouse(memberId: string, locked = false): StagedSpouse {
  return { key: `existing:${memberId}`, kind: "existing", memberId, divorced: false, locked };
}

export function moveStagedSpouse(
  spouses: StagedSpouse[],
  key: string,
  direction: -1 | 1,
): StagedSpouse[] {
  const from = spouses.findIndex((spouse) => spouse.key === key);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= spouses.length) return spouses;
  const next = [...spouses];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export function stagedSpouseMember(
  spouse: StagedSpouse,
  members: FamilyMember[],
): FamilyMember | undefined {
  if (spouse.kind === "existing") return members.find((member) => member.id === spouse.memberId);
  if (spouse.kind === "new" && spouse.input) {
    return {
      ...spouse.input,
      id: spouse.key,
      gender: "female",
      created_at: "",
      updated_at: "",
    };
  }
  if (spouse.kind === "unknown") {
    return {
      id: spouse.key,
      name_en: "Unknown wife",
      name_ar: "زوجة غير معروفة",
      gender: "female",
      is_unknown: true,
      created_at: "",
      updated_at: "",
    };
  }
}
