import { describe, expect, it } from "vitest";
import { translate } from "@/locales";
import { addMemberTitleKey } from "./add-member-title";

describe("contextual add-member titles", () => {
  it.each([
    [{ parentRole: "father" as const }, "add_father", "Add Father", "إضافة أب"],
    [{ parentRole: "mother" as const }, "add_mother", "Add Mother", "إضافة أم"],
    [{ fatherId: "father" }, "add_child", "Add Child", "إضافة ابن/ابنة"],
    [{ motherId: "mother" }, "add_child", "Add Child", "إضافة ابن/ابنة"],
    [{ spouseId: "spouse" }, "add_spouse", "Add Spouse", "إضافة زوج"],
    [{}, "add_member", "Add Member", "إضافة فرد"],
  ])("selects and translates the appropriate title", (context, key, english, arabic) => {
    const titleKey = addMemberTitleKey(context);
    expect(titleKey).toBe(key);
    expect(translate("en", titleKey)).toBe(english);
    expect(translate("ar", titleKey)).toBe(arabic);
  });
});
