export type Gender = "male" | "female" | "unspecified";
export type CitizenStatus = "resident" | "non_resident";

export interface ExternalChild {
  id: string;
  name: string;
  other_parent_name?: string;
  birth_year?: string;
  notes?: string;
}

export interface FamilyMember {
  id: string;
  name_en: string;
  name_ar: string;
  gender: Gender;
  birth_date?: string;
  death_date?: string;
  citizen_status?: CitizenStatus;
  image_url?: string;
  notes?: string;
  father_id?: string;
  mother_id?: string;
  spouse_id?: string;
  spouse_ids?: string[];
  divorced_from?: string[];
  is_unknown?: boolean;
  external_children?: ExternalChild[];
  subfamily_id?: string;
  pos_x?: number;
  pos_y?: number;
  created_at: string;
  updated_at: string;
}

export interface SubFamilyAttachment {
  id: string;
  name: string;
  type: string;
  url: string;
  created_at: string;
}

export interface SubFamily {
  id: string;
  name_en: string;
  name_ar: string;
  linked_male_id?: string;
  parent_subfamily_id?: string;
  notes?: string;
  attachments?: SubFamilyAttachment[];
  color?: string;
  created_at: string;
  updated_at: string;
}

export type MemberInput = Omit<FamilyMember, "id" | "created_at" | "updated_at">;
