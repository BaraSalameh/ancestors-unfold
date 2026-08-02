import { useState } from "react";
import { familyStore } from "@/features/trees";
import type { FamilyMember, SubFamily } from "@/features/members";
import { displayName, useI18n } from "@/shared/i18n";
import { matchingMaleMember } from "../domain/male-member-match";

export function SubfamilyEditForm({
  subfamily,
  maleMembers,
  onClose,
}: {
  subfamily: SubFamily;
  maleMembers: FamilyMember[];
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const linked = maleMembers.find(({ id }) => id === subfamily.linked_male_id);
  const [nameEn, setNameEn] = useState(subfamily.name_en);
  const [nameAr, setNameAr] = useState(subfamily.name_ar);
  const [maleId, setMaleId] = useState(subfamily.linked_male_id ?? "");
  const [maleSearch, setMaleSearch] = useState(linked ? displayName(linked, lang) : "");
  const save = () => {
    const nextNameEn = nameEn.trim();
    const nextNameAr = nameAr.trim();
    if (!nextNameEn && !nextNameAr) return;
    const matched = matchingMaleMember(maleMembers, maleSearch, lang);
    familyStore.updateSubfamily(subfamily.id, {
      name_en: nextNameEn || subfamily.name_en,
      name_ar: nextNameAr || subfamily.name_ar,
      linked_male_id: matched?.id ?? (maleId || undefined),
    });
    onClose();
  };
  const changeMale = (value: string) => {
    setMaleSearch(value);
    setMaleId(matchingMaleMember(maleMembers, value, lang)?.id ?? "");
  };
  return (
    <div className="space-y-2 rounded border bg-background/50 p-2">
      <input
        type="text"
        value={nameEn}
        onChange={(event) => setNameEn(event.target.value)}
        placeholder={t("name_en")}
        className="w-full rounded border bg-background px-2 py-1 text-[10px]"
      />
      <input
        type="text"
        value={nameAr}
        onChange={(event) => setNameAr(event.target.value)}
        placeholder={t("name_ar")}
        className="w-full rounded border bg-background px-2 py-1 text-[10px]"
      />
      <input
        type="text"
        value={maleSearch}
        onChange={(event) => changeMale(event.target.value)}
        placeholder={t("search_male")}
        className="w-full rounded border bg-background px-2 py-1 text-[10px]"
        list="subfamily-male-list"
      />
      <datalist id="subfamily-male-list">
        {maleMembers.map((member) => (
          <option key={member.id} value={displayName(member, lang)} />
        ))}
      </datalist>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={save}
          className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground"
        >
          {t("save")}
        </button>
        <button type="button" onClick={onClose} className="rounded border px-2 py-1 text-[10px]">
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
