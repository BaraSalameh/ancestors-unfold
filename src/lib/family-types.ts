export type Gender = "male" | "female";

export interface FamilyMember {
  id: string;
  name_en: string;
  name_ar: string;
  gender: Gender;
  birth_date?: string;
  death_date?: string;
  image_url?: string;
  notes?: string;
  father_id?: string;
  mother_id?: string;
  spouse_id?: string;
  created_at: string;
  updated_at: string;
}

export type MemberInput = Omit<FamilyMember, "id" | "created_at" | "updated_at">;
