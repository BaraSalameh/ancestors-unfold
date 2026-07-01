import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { User, Heart, Cake, Sparkles } from "lucide-react";
import { displayName, useI18n } from "@/lib/i18n";
import type { FamilyMember } from "@/lib/family-types";

export interface MemberNodeData {
  member: FamilyMember;
  spouse?: FamilyMember;
  highlighted?: boolean;
  onOpen: (id: string) => void;
}

const genderTheme = (g: "male" | "female") =>
  g === "male"
    ? {
        ring: "ring-sky-400/60",
        strip: "from-sky-500 via-sky-400 to-cyan-400",
        chip: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
        avatarBg: "bg-gradient-to-br from-sky-500 to-cyan-400",
        handle: "!bg-sky-500",
        border: "border-sky-200/70 dark:border-sky-500/30",
      }
    : {
        ring: "ring-pink-400/60",
        strip: "from-pink-500 via-rose-400 to-fuchsia-400",
        chip: "bg-pink-500/10 text-pink-600 dark:text-pink-300",
        avatarBg: "bg-gradient-to-br from-pink-500 to-fuchsia-400",
        handle: "!bg-pink-500",
        border: "border-pink-200/70 dark:border-pink-500/30",
      };

function Card({
  member,
  compact,
  highlighted,
  onOpen,
}: {
  member: FamilyMember;
  compact?: boolean;
  highlighted?: boolean;
  onOpen: (id: string) => void;
}) {
  const { lang, t } = useI18n();
  const th = genderTheme(member.gender);
  const deceased = !!member.death_date;
  const birthY = member.birth_date?.slice(0, 4);
  const deathY = member.death_date?.slice(0, 4);

  return (
    <button
      onClick={() => onOpen(member.id)}
      className={`group relative flex ${compact ? "w-56" : "w-64"} flex-col overflow-hidden rounded-2xl border ${th.border} bg-card text-start shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.15)] transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_36px_-14px_rgba(0,0,0,0.25)] ${
        highlighted ? `ring-2 ring-offset-2 ring-offset-background ${th.ring}` : ""
      }`}
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${th.strip}`} />
      <div className="flex items-center gap-3 p-3">
        <div className="relative shrink-0">
          {member.image_url ? (
            <img
              src={member.image_url}
              alt=""
              className={`${compact ? "h-10 w-10" : "h-12 w-12"} rounded-full object-cover ring-2 ring-white dark:ring-slate-800`}
            />
          ) : (
            <div
              className={`${compact ? "h-10 w-10" : "h-12 w-12"} flex items-center justify-center rounded-full ${th.avatarBg} text-white ring-2 ring-white dark:ring-slate-800`}
            >
              <User className={compact ? "h-5 w-5" : "h-6 w-6"} />
            </div>
          )}
          {deceased && (
            <span className="absolute -bottom-1 -right-1 rounded-full bg-slate-700 px-1 text-[8px] font-semibold uppercase tracking-wider text-white shadow">
              ✝
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-card-foreground">
            {displayName(member, lang)}
          </div>
          <div
            className="truncate text-[11px] text-muted-foreground"
            dir={lang === "ar" ? "ltr" : "rtl"}
          >
            {lang === "ar" ? member.name_en : member.name_ar}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${th.chip}`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              {t(member.gender)}
            </span>
            {birthY && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
                <Cake className="h-2.5 w-2.5" />
                {birthY}
                {deathY ? `–${deathY}` : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function MemberNodeImpl({ data }: NodeProps<MemberNodeData>) {
  const { member, spouse, highlighted, onOpen } = data;
  const th = genderTheme(member.gender);
  const { t } = useI18n();

  return (
    <div className="relative">
      {/* connectors: top = parent target, bottom = child source */}
      <Handle
        id="parent-in"
        type="target"
        position={Position.Top}
        className={`!h-3 !w-3 !border-2 !border-background ${th.handle}`}
      />
      <Handle
        id="child-out"
        type="source"
        position={Position.Bottom}
        className={`!h-3 !w-3 !border-2 !border-background ${th.handle}`}
      />

      <Card member={member} highlighted={highlighted} onOpen={onOpen} />

      {spouse && (
        <>
          <div className="absolute top-8 -translate-y-1/2 ltr:left-full rtl:right-full flex items-center gap-1 ltr:pl-2 rtl:pr-2">
            <div className="h-0.5 w-6 bg-gradient-to-r from-pink-400 to-rose-500" />
            <div className="flex items-center gap-1 rounded-full border border-pink-300/60 bg-pink-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-pink-600 shadow-sm dark:border-pink-500/30 dark:bg-pink-500/10 dark:text-pink-300">
              <Heart className="h-2.5 w-2.5 fill-current" />
              {t("spouse")}
            </div>
            <div className="h-0.5 w-6 bg-gradient-to-r from-rose-500 to-pink-400" />
          </div>
          <div className="absolute top-0 ltr:left-[calc(100%+7rem)] rtl:right-[calc(100%+7rem)]">
            <Card member={spouse} compact highlighted={highlighted} onOpen={onOpen} />
          </div>
        </>
      )}
    </div>
  );
}

export const MemberNode = memo(MemberNodeImpl);
