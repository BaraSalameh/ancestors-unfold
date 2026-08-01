import type { FamilyMember } from "@/features/members/domain";

export function createSampleFamily(): FamilyMember[] {
  const now = new Date().toISOString();
  const member = (
    id: string,
    name_en: string,
    name_ar: string,
    gender: "male" | "female",
    extra: Partial<FamilyMember> = {},
  ): FamilyMember => ({
    id,
    name_en,
    name_ar,
    gender,
    citizen_status: "resident",
    created_at: now,
    updated_at: now,
    ...extra,
  });
  return [
    member("1", "Abdullah Al-Rashid", "عبدالله الراشد", "male", {
      birth_date: "1920-03-12",
      death_date: "1998-11-04",
    }),
    member("2", "Fatimah Al-Saeed", "فاطمة السعيد", "female", {
      birth_date: "1925-06-22",
      death_date: "2002-01-18",
      spouse_id: "1",
    }),
    member("3", "Mohammed Al-Rashid", "محمد الراشد", "male", {
      birth_date: "1948-09-01",
      father_id: "1",
      mother_id: "2",
    }),
    member("4", "Aisha Al-Mansour", "عائشة المنصور", "female", {
      birth_date: "1952-04-14",
      spouse_id: "3",
    }),
    member("5", "Khalid Al-Rashid", "خالد الراشد", "male", {
      birth_date: "1950-02-20",
      father_id: "1",
      mother_id: "2",
    }),
    member("6", "Omar Al-Rashid", "عمر الراشد", "male", {
      birth_date: "1975-07-08",
      father_id: "3",
      mother_id: "4",
      citizen_status: "non_resident",
    }),
    member("7", "Layla Hassan", "ليلى حسن", "female", {
      birth_date: "1978-10-30",
      spouse_id: "6",
    }),
    member("8", "Sara Al-Rashid", "سارة الراشد", "female", {
      birth_date: "1980-12-05",
      father_id: "3",
      mother_id: "4",
    }),
    member("9", "Yusuf Al-Rashid", "يوسف الراشد", "male", {
      birth_date: "2005-05-19",
      father_id: "6",
      mother_id: "7",
    }),
    member("10", "Mariam Al-Rashid", "مريم الراشد", "female", {
      birth_date: "2008-03-22",
      father_id: "6",
      mother_id: "7",
    }),
    member("11", "Hassan Al-Rashid", "حسن الراشد", "male", {
      birth_date: "1977-01-11",
      father_id: "5",
    }),
  ];
}
