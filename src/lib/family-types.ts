export type Gender = "male" | "female";
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
  /** All spouses for polygamous males. Additive to spouse_id. */
  spouse_ids?: string[];
  /** IDs of previous partners the member has divorced. Symmetric with the other side. */
  divorced_from?: string[];
  /** Placeholder wife with no known identity. Rendered only inside husband card, never as an own card. */
  is_unknown?: boolean;
  /**
   * Children this woman had with another (out-of-tree) husband. Kept on the mother.
   */
  external_children?: ExternalChild[];
  /** ID of the sub-family this member belongs to */
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
  /** Optional containing sub-family. Sub-families may be nested to any depth. */
  parent_subfamily_id?: string;
  notes?: string;
  attachments?: SubFamilyAttachment[];
  color?: string;
  created_at: string;
  updated_at: string;
}

export type MemberInput = Omit<FamilyMember, "id" | "created_at" | "updated_at">;
