type AddMemberTitleContext = {
  fatherId?: string;
  motherId?: string;
  spouseId?: string;
  parentRole?: "father" | "mother";
};

export function addMemberTitleKey({
  fatherId,
  motherId,
  spouseId,
  parentRole,
}: AddMemberTitleContext): "add_father" | "add_mother" | "add_child" | "add_spouse" | "add_member" {
  if (parentRole === "father") return "add_father";
  if (parentRole === "mother") return "add_mother";
  if (spouseId) return "add_spouse";
  if (fatherId || motherId) return "add_child";
  return "add_member";
}
