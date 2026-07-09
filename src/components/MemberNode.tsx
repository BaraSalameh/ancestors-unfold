import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { useNavigate } from "@tanstack/react-router";
import { User, Cake, Sparkles, Heart, Unlink, Link2, UserPlus, HelpCircle, Plus } from "lucide-react";


import { displayName, ordinal, useI18n } from "@/lib/i18n";
import type { FamilyMember } from "@/lib/family-types";
import { wifeColorFor } from "@/lib/wife-colors";
import { familyStore } from "@/lib/family-store";

export interface MemberNodeData {
  member: FamilyMember;
  highlighted?: boolean;
  onOpen: (id: string) => void;
  wives?: FamilyMember[]; // ordered wives, only present for husbands
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

function MemberNodeImpl({ data }: NodeProps<MemberNodeData>) {
  const { member, highlighted, onOpen, wives } = data;
  const th = genderTheme(member.gender);
  const { lang, t } = useI18n();
  const navigate = useNavigate();

  const birthY = member.birth_date?.slice(0, 4);
  const deathY = member.death_date?.slice(0, 4);


  return (
    <div className="relative">
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
      <Handle
        id="spouse-l"
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-purple-500"
      />
      <Handle
        id="spouse-r"
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-purple-500"
      />

      <button
        onClick={() => onOpen(member.id)}
        className={`group relative flex w-64 flex-col overflow-hidden rounded-2xl border ${th.border} bg-card text-start shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.15)] transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_36px_-14px_rgba(0,0,0,0.25)] ${
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
                className="h-12 w-12 rounded-full object-cover ring-2 ring-white dark:ring-slate-800"
              />
            ) : (
              <div
                className={`h-12 w-12 flex items-center justify-center rounded-full ${th.avatarBg} text-white ring-2 ring-white dark:ring-slate-800`}
              >
                <User className="h-6 w-6" />
              </div>
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
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
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
              {member.gender === "female" && (member.external_children?.length ?? 0) > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300"
                  title={
                    t("has_external_children") +
                    ": " +
                    (member.external_children ?? [])
                      .map((c) => c.name + (c.other_parent_name ? ` (${c.other_parent_name})` : ""))
                      .join(", ")
                  }
                >
                  <UserPlus className="h-2.5 w-2.5" />
                  {member.external_children!.length}
                </span>
              )}
            </div>
          </div>
        </div>


        {member.gender === "male" && (
          <div className="border-t border-border/60 bg-muted/30 px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Heart className="h-2.5 w-2.5" />
              <span>{t("spouses")}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate({ to: "/edit/$id", params: { id: member.id } });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    navigate({ to: "/edit/$id", params: { id: member.id } });
                  }
                }}
                title={t("edit_spouses")}
                className="ms-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] normal-case tracking-normal text-primary transition hover:bg-primary/20"
              >
                <Plus className="h-2.5 w-2.5" />
                <span>{t("edit")}</span>
              </span>
            </div>
            {(!wives || wives.length === 0) ? (
              <div className="rounded-md border border-dashed border-border/80 bg-background/60 px-2 py-1.5 text-[10px] italic text-muted-foreground">
                {t("no_spouses_recorded")}
              </div>
            ) : (
            <div className="flex max-h-24 flex-col gap-1 overflow-y-auto pr-1">
              {wives.map((w, i) => {

                const c = wifeColorFor(i);
                const divorced = (member.divorced_from ?? []).includes(w.id);
                const wBirth = w.birth_date?.slice(0, 4);
                const wDeath = w.death_date?.slice(0, 4);
                const years = wBirth ? `${wBirth}${wDeath ? `–${wDeath}` : ""}` : "";
                return (
                  <div
                    key={w.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium ring-1"
                    style={
                      (divorced
                        ? {
                            backgroundColor: "hsl(var(--muted))",
                            color: "hsl(var(--muted-foreground))",
                            ["--tw-ring-color" as never]: "hsl(var(--border))",
                          }
                        : {
                            backgroundColor: `${c.stroke}1a`,
                            color: c.stroke,
                            ["--tw-ring-color" as never]: `${c.stroke}55`,
                          }) as React.CSSProperties
                    }


                    title={`${ordinal(i + 1, lang)} — ${displayName(w, lang)}${years ? ` (${years})` : ""}${
                      divorced ? ` · ${t("divorced")}` : ""
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: divorced ? "#94a3b8" : c.stroke }}
                    />
                    <span className="shrink-0 opacity-70">{ordinal(i + 1, lang)}</span>
                    <span className={`truncate ${divorced ? "line-through" : ""}`}>
                      {w.is_unknown ? (
                        <span className="italic opacity-80">{t("unknown_wife")}</span>
                      ) : (
                        displayName(w, lang)
                      )}
                    </span>
                    {w.is_unknown && <HelpCircle className="h-2.5 w-2.5 shrink-0 opacity-60" />}
                    {(w.external_children?.length ?? 0) > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1 text-[9px] text-amber-700 dark:text-amber-300"
                        title={t("has_external_children")}
                      >
                        <UserPlus className="h-2 w-2" />
                        {w.external_children!.length}
                      </span>
                    )}
                    {years && (
                      <span className="shrink-0 opacity-70 tabular-nums">{years}</span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        familyStore.toggleDivorce(member.id, w.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          familyStore.toggleDivorce(member.id, w.id);
                        }
                      }}
                      title={divorced ? t("mark_married") : t("mark_divorced")}
                      className="ms-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-70 transition hover:opacity-100 hover:scale-110"
                    >
                      {divorced ? (
                        <Link2 className="h-2.5 w-2.5" />
                      ) : (
                        <Unlink className="h-2.5 w-2.5" />
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            )}
          </div>

        )}
      </button>
    </div>
  );
}

export const MemberNode = memo(MemberNodeImpl);
