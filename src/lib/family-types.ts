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
  /** IDs of previous partners the member has divorced. Symmetric with the other side. */
  divorced_from?: string[];
  pos_x?: number;
  pos_y?: number;
  created_at: string;
  updated_at: string;
}

export type MemberInput = Omit<FamilyMember, "id" | "created_at" | "updated_at">;
