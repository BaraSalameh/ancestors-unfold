import type { CitizenStatus, ExternalChild, Gender, MemberInput } from "./types";

export interface MemberFormDraft {
  name_en: string;
  name_ar: string;
  gender: Gender;
  citizen_status: CitizenStatus;
  birth_date: string;
  death_date: string;
  image_url: string;
  image_public_id?: string;
  image_asset_id?: string;
  notes: string;
  father_id: string;
  mother_id: string;
  spouse_id: string;
  external_children: ExternalChild[];
}

export type MemberFormError = "name_required" | "image_url_invalid";
type MemberPayloadResult =
  { ok: true; payload: MemberInput } | { ok: false; error: MemberFormError };

function validImageUrl(value: string): boolean {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function memberFormPayload(
  draft: MemberFormDraft,
  includeSpouse: boolean,
): MemberPayloadResult {
  const nameEn = draft.name_en.trim();
  const nameAr = draft.name_ar.trim();
  if (!nameEn && !nameAr) return { ok: false, error: "name_required" };

  const imageUrl = draft.image_url.trim();
  if (!validImageUrl(imageUrl)) return { ok: false, error: "image_url_invalid" };
  const payload: MemberInput = {
    name_en: nameEn,
    name_ar: nameAr,
    gender: draft.gender,
    citizen_status: draft.citizen_status,
    birth_date: draft.birth_date || undefined,
    death_date: draft.death_date || undefined,
    image_url: imageUrl || undefined,
    image_public_id: imageUrl ? draft.image_public_id : undefined,
    image_asset_id: imageUrl ? draft.image_asset_id : undefined,
    notes: draft.notes.trim() || undefined,
    father_id: draft.father_id || undefined,
    mother_id: draft.mother_id || undefined,
    external_children: draft.external_children.length ? draft.external_children : undefined,
  };
  if (includeSpouse) payload.spouse_id = draft.spouse_id || undefined;
  return { ok: true, payload };
}

export function initialMemberFormDraft(initial: Partial<MemberInput> = {}): MemberFormDraft {
  return {
    name_en: initial.name_en ?? "",
    name_ar: initial.name_ar ?? "",
    gender: initial.gender ?? "male",
    citizen_status: initial.citizen_status ?? "resident",
    birth_date: initial.birth_date ?? "",
    death_date: initial.death_date ?? "",
    image_url: initial.image_url ?? "",
    image_public_id: initial.image_public_id,
    image_asset_id: initial.image_asset_id,
    notes: initial.notes ?? "",
    father_id: initial.father_id ?? "",
    mother_id: initial.mother_id ?? "",
    spouse_id: initial.spouse_id ?? "",
    external_children: initial.external_children ?? [],
  };
}
