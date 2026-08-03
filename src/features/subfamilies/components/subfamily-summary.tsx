import { displayName, useI18n } from "@/shared/i18n";
import { isMemberDeceased, type FamilyMember, type SubFamily } from "@/features/members";

export function SubfamilySummary({
  subfamily,
  members,
  linkedMale,
}: {
  subfamily: SubFamily;
  members: FamilyMember[];
  linkedMale: FamilyMember | null;
}) {
  const { t, lang } = useI18n();
  const living = members.filter((member) => !isMemberDeceased(member));
  const values = [
    ["subfamily_total", members.length],
    ["subfamily_living", living.length],
    ["subfamily_living_males", living.filter(({ gender }) => gender === "male").length],
    ["subfamily_living_females", living.filter(({ gender }) => gender === "female").length],
    ["subfamily_males", members.filter(({ gender }) => gender === "male").length],
    ["subfamily_females", members.filter(({ gender }) => gender === "female").length],
  ] as const;
  return (
    <>
      <h3 className="font-semibold text-card-foreground">{displayName(subfamily, lang)}</h3>
      {linkedMale && (
        <div className="text-[10px] text-muted-foreground">
          {t("linked_male")}:{" "}
          <span className="font-medium text-foreground">{displayName(linkedMale, lang)}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {values.map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card p-2 shadow-sm">
            <div className="text-lg font-bold leading-none text-foreground">{value}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">{t(label)}</div>
          </div>
        ))}
      </div>
    </>
  );
}
