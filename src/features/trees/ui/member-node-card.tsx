import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Cake, User, UserPlus } from "lucide-react";
import { ExpandableProfileImage, isMemberDeceased, type FamilyMember } from "@/features/members";
import { displayName, useI18n } from "@/shared/i18n";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { familyStore } from "../client/family-store";
import type { MemberNodeTheme } from "./member-node-theme";
import { MemberNodeWives } from "./member-node-wives";

export function MemberNodeCard({
  member,
  wives,
  imageSrc,
  theme,
  highlighted,
  selected,
  open,
}: {
  member: FamilyMember;
  wives?: FamilyMember[];
  imageSrc?: string;
  theme: MemberNodeTheme;
  highlighted?: boolean;
  selected: boolean;
  open: () => void;
}) {
  const { lang } = useI18n();
  const activate = (event: MouseEvent) => {
    event.stopPropagation();
    open();
  };
  const keyActivate = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    open();
  };
  const selectionRing =
    highlighted || selected
      ? `ring-2 ring-offset-2 ring-offset-background ${selected ? "ring-primary/70" : theme.ring}`
      : "";
  return (
    <div
      role="button"
      tabIndex={0}
      data-member-card
      dir={lang === "ar" ? "rtl" : "ltr"}
      onDoubleClick={activate}
      onKeyDown={keyActivate}
      className={`group relative flex w-64 flex-col overflow-hidden rounded-xl border ${theme.border} bg-card text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_18px_-8px_rgba(15,23,42,0.16)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-primary/35 hover:shadow-[0_2px_4px_rgba(0,0,0,0.08),0_12px_28px_-10px_rgba(15,23,42,0.22)] ${selectionRing}`}
    >
      <div className={`h-1 w-full bg-linear-to-r ${theme.strip}`} />
      <div className="flex items-center gap-3 p-3">
        <MemberAvatar member={member} imageSrc={imageSrc} avatarClass={theme.avatarBg} />
        <MemberSummary member={member} />
      </div>
      <MemberNodeWives husband={member} wives={wives} />
    </div>
  );
}

function MemberAvatar({
  member,
  imageSrc,
  avatarClass,
}: {
  member: FamilyMember;
  imageSrc?: string;
  avatarClass: string;
}) {
  const { lang } = useI18n();
  return (
    <div className="relative shrink-0">
      {imageSrc ? (
        <ExpandableProfileImage
          src={imageSrc}
          name={displayName(member, lang)}
          className="nodrag nopan h-11 w-11 rounded-lg ring-1 ring-border"
        />
      ) : (
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg ${avatarClass} text-white shadow-sm`}
        >
          <User className="h-6 w-6" />
        </div>
      )}
    </div>
  );
}

function MemberSummary({ member }: { member: FamilyMember }) {
  const { lang, t } = useI18n();
  const [subfamilyOpen, setSubfamilyOpen] = useState(false);
  const current = familyStore.getClosestSubfamily(member.id);
  const birth = member.birth_date?.slice(0, 4);
  const death = member.death_date?.slice(0, 4);
  const deceased = isMemberDeceased(member);
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-bold text-card-foreground">
        {displayName(member, lang)}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rtl:justify-end">
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
          {member.citizen_status === "non_resident" ? t("non_resident") : t("resident")}
        </span>
        {deceased && (
          <span className="inline-flex items-center rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:text-slate-300">
            {t("deceased")}
          </span>
        )}
        {current && (
          <SubfamilyChip memberId={member.id} open={subfamilyOpen} setOpen={setSubfamilyOpen} />
        )}
        {birth && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
            <Cake className="h-2.5 w-2.5" />
            {birth}
            {death ? `–${death}` : ""}
          </span>
        )}
        <ExternalChildrenBadge member={member} />
      </div>
    </div>
  );
}

function SubfamilyChip({
  memberId,
  open,
  setOpen,
}: {
  memberId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { lang, t } = useI18n();
  const current = familyStore.getClosestSubfamily(memberId)!;
  const subfamilies = familyStore.getSubfamilies();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={(event) => event.stopPropagation()}>
        <button
          disabled
          className="pointer-events-none inline-flex cursor-default items-center gap-1 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-600 dark:text-purple-300"
        >
          {displayName(current, lang)}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-2" onClick={(event) => event.stopPropagation()}>
        <div className="space-y-1 text-[10px]">
          <button
            onClick={() => {
              familyStore.assignSubfamily(memberId, undefined);
              setOpen(false);
            }}
            className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
          >
            {t("none")}
          </button>
          {subfamilies.map((subfamily) => (
            <button
              key={subfamily.id}
              onClick={() => {
                familyStore.assignSubfamily(memberId, subfamily.id);
                setOpen(false);
              }}
              className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
            >
              {current.id === subfamily.id ? "✓ " : "  "}
              {displayName(subfamily, lang)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ExternalChildrenBadge({ member }: { member: FamilyMember }) {
  const { t } = useI18n();
  if (member.gender !== "female" || !member.external_children?.length) return null;
  const names = member.external_children
    .map((child) => child.name + (child.other_parent_name ? ` (${child.other_parent_name})` : ""))
    .join(", ");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300"
      title={`${t("has_external_children")}: ${names}`}
    >
      <UserPlus className="h-2.5 w-2.5" />
      {member.external_children.length}
    </span>
  );
}
