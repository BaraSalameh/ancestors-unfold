import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

type Dict = Record<string, { en: string; ar: string }>;

const dict: Dict = {
  app_name: { en: "Family Tree Hub", ar: "شجرة العائلة" },
  family_tree: { en: "Family Tree", ar: "شجرة العائلة" },
  settings: { en: "Settings", ar: "الإعدادات" },
  add_member: { en: "Add Member", ar: "إضافة فرد" },
  edit_member: { en: "Edit Member", ar: "تعديل الفرد" },
  member_details: { en: "Member Details", ar: "تفاصيل الفرد" },
  search_placeholder: { en: "Search by name…", ar: "ابحث بالاسم…" },
  language: { en: "Language", ar: "اللغة" },
  theme: { en: "Theme", ar: "المظهر" },
  light: { en: "Light", ar: "فاتح" },
  dark: { en: "Dark", ar: "داكن" },
  english: { en: "English", ar: "الإنجليزية" },
  arabic: { en: "Arabic", ar: "العربية" },
  name_en: { en: "Name (English)", ar: "الاسم (إنجليزي)" },
  name_ar: { en: "Name (Arabic)", ar: "الاسم (عربي)" },
  gender: { en: "Gender", ar: "الجنس" },
  male: { en: "Male", ar: "ذكر" },
  female: { en: "Female", ar: "أنثى" },
  birth_date: { en: "Date of Birth", ar: "تاريخ الميلاد" },
  death_date: { en: "Date of Death", ar: "تاريخ الوفاة" },
  image_url: { en: "Profile Image URL", ar: "رابط الصورة" },
  notes: { en: "Biography / Notes", ar: "نبذة / ملاحظات" },
  father: { en: "Father", ar: "الأب" },
  mother: { en: "Mother", ar: "الأم" },
  spouse: { en: "Spouse", ar: "الزوج/الزوجة" },
  children: { en: "Children", ar: "الأبناء" },
  generation: { en: "Generation", ar: "الجيل" },
  status: { en: "Status", ar: "الحالة" },
  living: { en: "Living", ar: "على قيد الحياة" },
  deceased: { en: "Deceased", ar: "متوفى" },
  save: { en: "Save", ar: "حفظ" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  delete: { en: "Delete", ar: "حذف" },
  edit: { en: "Edit", ar: "تعديل" },
  back: { en: "Back", ar: "رجوع" },
  add_child: { en: "Add Child", ar: "إضافة ابن/ابنة" },
  add_parent: { en: "Add Parent", ar: "إضافة والد" },
  add_spouse: { en: "Add Spouse", ar: "إضافة زوج" },
  none: { en: "None", ar: "لا يوجد" },
  no_father: { en: "— None —", ar: "— لا يوجد —" },
  ancestors: { en: "Ancestors", ar: "الأجداد" },
  descendants: { en: "Descendants", ar: "الأحفاد" },
  confirm_delete: { en: "Delete this family member?", ar: "حذف هذا الفرد؟" },
  confirm_delete_desc: {
    en: "This action cannot be undone. Connected relatives will be unlinked.",
    ar: "لا يمكن التراجع. سيتم فصل الأقارب المرتبطين.",
  },
  delete_warning_children: {
    en: "This member has children. Deleting will unlink them but keep their records.",
    ar: "لهذا الفرد أبناء. الحذف سيفصلهم لكن يبقي سجلاتهم.",
  },
  created: { en: "Member added", ar: "تمت الإضافة" },
  updated: { en: "Member updated", ar: "تم التحديث" },
  deleted: { en: "Member deleted", ar: "تم الحذف" },
  reset_data: { en: "Reset to sample data", ar: "إعادة البيانات الأولية" },
  data_reset: { en: "Data reset", ar: "تمت إعادة الضبط" },
  name_required: { en: "At least one name (English or Arabic) is required", ar: "يلزم إدخال الاسم بالإنجليزية أو العربية" },
  gender_required: { en: "Gender is required", ar: "الجنس مطلوب" },
  zoom_in: { en: "Zoom in", ar: "تكبير" },
  zoom_out: { en: "Zoom out", ar: "تصغير" },
  fit_view: { en: "Fit view", ar: "ملاءمة العرض" },
  no_results: { en: "No matching members", ar: "لا توجد نتائج" },
  basic_info: { en: "Basic Information", ar: "المعلومات الأساسية" },
  not_found: { en: "Member not found", ar: "الفرد غير موجود" },
  parent_label: { en: "Parent", ar: "والد" },
  father_label: { en: "Father", ar: "الأب" },
  mother_label: { en: "Mother", ar: "الأم" },
  link_updated: { en: "Relationship updated", ar: "تم تحديث العلاقة" },
  link_removed: { en: "Relationship removed", ar: "تم إزالة العلاقة" },
  cannot_link_self: { en: "A member cannot be their own parent", ar: "لا يمكن أن يكون الفرد والد نفسه" },
  cannot_link_cycle: { en: "This would create a cycle in the tree", ar: "سيؤدي هذا إلى حلقة في الشجرة" },
  connect_hint: { en: "Drag from a parent's bottom dot onto a child's top dot to link them.", ar: "اسحب من النقطة السفلية للوالد إلى النقطة العلوية للابن لربطهما." },
};

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: keyof typeof dict) => string;
  dir: "ltr" | "rtl";
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem("ft:lang")) as Lang | null;
    if (saved === "en" || saved === "ar") setLangState(saved);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("ft:lang", l);
  };

  const t = (k: keyof typeof dict) => dict[k]?.[lang] ?? String(k);
  const dir = lang === "ar" ? "rtl" : "ltr";

  return <Ctx.Provider value={{ lang, setLang, t, dir }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}

export function displayName(m: { name_en: string; name_ar: string }, lang: Lang) {
  if (lang === "ar") return m.name_ar || m.name_en;
  return m.name_en || m.name_ar;
}
