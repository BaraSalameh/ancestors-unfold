import type { CSSProperties } from "react";
import { Heart, HelpCircle, UserPlus } from "lucide-react";
import type { FamilyMember } from "@/features/members";
import { displayName, ordinal, useI18n } from "@/shared/i18n";
import { wifeColorFor } from "../domain/wife-colors";

export function MemberNodeWives({
  husband,
  wives,
}: {
  husband: FamilyMember;
  wives?: FamilyMember[];
}) {
  const { t } = useI18n();
  if (husband.gender !== "male" || !wives?.length) return null;
  return (
    <div className="border-t border-border/60 bg-muted/30 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Heart className="h-2.5 w-2.5" />
        <span>{t("spouses")}</span>
      </div>
      <div className="flex max-h-24 flex-col gap-1 overflow-y-auto pr-1">
        {wives.map((wife, index) => (
          <WifeChip key={wife.id} husband={husband} wife={wife} index={index} />
        ))}
      </div>
    </div>
  );
}

function WifeChip({
  husband,
  wife,
  index,
}: {
  husband: FamilyMember;
  wife: FamilyMember;
  index: number;
}) {
  const { lang, t } = useI18n();
  const color = wifeColorFor(index);
  const divorced = husband.divorced_from?.includes(wife.id) ?? false;
  const birth = wife.birth_date?.slice(0, 4);
  const death = wife.death_date?.slice(0, 4);
  const years = birth ? `${birth}${death ? `–${death}` : ""}` : "";
  const style = wifeChipStyle(divorced, color.stroke);
  const title = `${ordinal(index + 1, lang)} — ${displayName(wife, lang)}${years ? ` (${years})` : ""}${divorced ? ` · ${t("divorced")}` : ""}`;
  return (
    <div
      className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium ring-1"
      style={style}
      title={title}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: divorced ? "#94a3b8" : color.stroke }}
      />
      <span className="shrink-0 opacity-70">{ordinal(index + 1, lang)}</span>
      <WifeName wife={wife} divorced={divorced} />
      {wife.is_unknown && <HelpCircle className="h-2.5 w-2.5 shrink-0 opacity-60" />}
      {Boolean(wife.external_children?.length) && (
        <span
          className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1 text-[9px] text-amber-700 dark:text-amber-300"
          title={t("has_external_children")}
        >
          <UserPlus className="h-2 w-2" />
          {wife.external_children!.length}
        </span>
      )}
      {years && <span className="shrink-0 opacity-70 tabular-nums">{years}</span>}
    </div>
  );
}

function wifeChipStyle(divorced: boolean, stroke: string): CSSProperties {
  if (divorced)
    return {
      backgroundColor: "hsl(var(--muted))",
      color: "hsl(var(--muted-foreground))",
      ["--tw-ring-color" as never]: "hsl(var(--border))",
    };
  return {
    backgroundColor: `${stroke}1a`,
    color: stroke,
    ["--tw-ring-color" as never]: `${stroke}55`,
  };
}

function WifeName({ wife, divorced }: { wife: FamilyMember; divorced: boolean }) {
  const { lang, t } = useI18n();
  return (
    <span className={`truncate ${divorced ? "line-through" : ""}`}>
      {wife.is_unknown ? (
        <span className="italic opacity-80">{t("unknown_wife")}</span>
      ) : (
        displayName(wife, lang)
      )}
    </span>
  );
}
