import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { User, Heart } from "lucide-react";
import { displayName, useI18n } from "@/lib/i18n";
import type { FamilyMember } from "@/lib/family-types";

export interface MemberNodeData {
  member: FamilyMember;
  spouse?: FamilyMember;
  highlighted?: boolean;
  onOpen: (id: string) => void;
}

function MemberNodeImpl({ data }: NodeProps<MemberNodeData>) {
  const { lang, t } = useI18n();
  const { member, spouse, highlighted, onOpen } = data;
  const deceased = !!member.death_date;

  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-muted-foreground/40" />
      <button
        onClick={() => onOpen(member.id)}
        className={`group flex w-64 items-center gap-3 rounded-xl border bg-card p-3 text-start shadow-sm transition hover:shadow-md ${
          highlighted ? "ring-2 ring-primary" : ""
        } ${member.gender === "male" ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-pink-500"}`}
      >
        <Avatar member={member} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-card-foreground">{displayName(member, lang)}</div>
          <div className="truncate text-xs text-muted-foreground" dir={lang === "ar" ? "ltr" : "rtl"}>
            {lang === "ar" ? member.name_en : member.name_ar}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{member.birth_date?.slice(0, 4) ?? "—"}</span>
            <span>·</span>
            <span>{deceased ? t("deceased") : t("living")}</span>
          </div>
        </div>
      </button>

      {spouse && (
        <>
          <div className="absolute top-1/2 -translate-y-1/2 ltr:left-full rtl:right-full flex items-center">
            <div className="h-px w-4 bg-pink-400" />
            <Heart className="h-3 w-3 text-pink-500" />
            <div className="h-px w-4 bg-pink-400" />
          </div>
          <button
            onClick={() => onOpen(spouse.id)}
            className={`absolute top-0 flex w-56 items-center gap-2 rounded-xl border bg-card p-2 text-start shadow-sm transition hover:shadow-md ltr:left-[calc(100%+3rem)] rtl:right-[calc(100%+3rem)] ${
              spouse.gender === "male" ? "border-l-4 border-l-blue-500" : "border-l-4 border-l-pink-500"
            }`}
          >
            <Avatar member={spouse} small />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">{displayName(spouse, lang)}</div>
              <div className="truncate text-[10px] text-muted-foreground">
                {spouse.birth_date?.slice(0, 4) ?? "—"} {spouse.death_date ? `– ${spouse.death_date.slice(0, 4)}` : ""}
              </div>
            </div>
          </button>
        </>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-muted-foreground/40" />
    </div>
  );
}

function Avatar({ member, small }: { member: FamilyMember; small?: boolean }) {
  const size = small ? "h-8 w-8" : "h-10 w-10";
  if (member.image_url) {
    return <img src={member.image_url} alt="" className={`${size} rounded-full object-cover`} />;
  }
  return (
    <div className={`${size} flex items-center justify-center rounded-full bg-muted text-muted-foreground`}>
      <User className={small ? "h-4 w-4" : "h-5 w-5"} />
    </div>
  );
}

export const MemberNode = memo(MemberNodeImpl);
