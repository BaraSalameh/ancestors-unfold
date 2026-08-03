import { useMemo, useState, type FormEvent } from "react";
import { computeWivesByHusband } from "@/features/trees/domain";
import {
  initialMemberFormDraft,
  memberFormPayload,
  withDeathDate,
  withDeceasedStatus,
  type MemberFormDraft,
  type MemberFormError,
} from "../domain/member-form-payload";
import {
  eligibleParentCandidates,
  invalidFatherIdsForFemale,
  reconcileMotherForFather,
} from "../domain/parent-selection";
import { descendantIds } from "../domain/relationships";
import type { FamilyMember, MemberInput } from "../domain/types";

interface UseMemberFormOptions {
  initial?: Partial<MemberInput>;
  initialImageFile?: File;
  memberId?: string;
  members: FamilyMember[];
  onSubmit: (data: MemberInput, imageFile?: File) => void;
}

export function useMemberForm(options: UseMemberFormOptions) {
  const { initial, initialImageFile, memberId, members, onSubmit } = options;
  const [draft, setDraft] = useState(() => initialMemberFormDraft(initial));
  const [imageFile, setImageFile] = useState<File | undefined>(initialImageFile);
  const [error, setError] = useState<MemberFormError | null>(null);
  const patch = <Key extends keyof MemberFormDraft>(key: Key, value: MemberFormDraft[Key]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const changeDeceased = (checked: boolean) =>
    setDraft((current) => withDeceasedStatus(current, checked));
  const changeDeathDate = (value: string) => setDraft((current) => withDeathDate(current, value));

  const excludedParentIds = useMemo(() => {
    const excluded = new Set(memberId ? descendantIds(members, memberId) : []);
    if (memberId && draft.gender === "female") {
      for (const id of invalidFatherIdsForFemale(members, memberId)) excluded.add(id);
    }
    return excluded;
  }, [draft.gender, memberId, members]);
  const eligibleFathers = useMemo(
    () =>
      eligibleParentCandidates({
        members,
        memberId,
        birthDate: draft.birth_date || undefined,
        gender: "male",
        excludedIds: excludedParentIds,
      }),
    [draft.birth_date, excludedParentIds, memberId, members],
  );
  const eligibleMothers = useMemo(
    () =>
      eligibleParentCandidates({
        members,
        memberId,
        birthDate: draft.birth_date || undefined,
        gender: "female",
        excludedIds: excludedParentIds,
      }),
    [draft.birth_date, excludedParentIds, memberId, members],
  );
  const wivesByHusband = useMemo(() => computeWivesByHusband(members), [members]);
  const changeFather = (fatherId: string) => {
    const spouseIds = new Set((wivesByHusband.get(fatherId) ?? []).map(({ id }) => id));
    setDraft((current) => ({
      ...current,
      father_id: fatherId,
      mother_id: reconcileMotherForFather(current.mother_id, fatherId, spouseIds),
    }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = memberFormPayload(draft, !(draft.gender === "male" && memberId));
    if (!result.ok) return setError(result.error);
    onSubmit(result.payload, imageFile);
  };

  return {
    draft,
    patch,
    changeDeceased,
    changeDeathDate,
    imageFile,
    setImageFile,
    error,
    clearError: () => setError(null),
    submit,
    changeFather,
    eligibleFathers,
    eligibleMothers,
    fatherWives: draft.father_id ? (wivesByHusband.get(draft.father_id) ?? []) : [],
    selectedFather: members.find(({ id }) => id === draft.father_id),
    selectedMother: members.find(({ id }) => id === draft.mother_id),
    males: members.filter((member) => member.gender === "male" && !member.is_unknown),
    females: members.filter((member) => member.gender === "female" && !member.is_unknown),
  };
}

export type MemberFormController = ReturnType<typeof useMemberForm>;
