import { memo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { User, Cake, Heart, UserPlus, HelpCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import type { FamilyMember, Gender } from "@/features/members";
import { displayName, ordinal, useI18n } from "@/shared/i18n";
import { familyStore, wifeColorFor } from "@/features/trees";

export interface MemberNodeData {
  member: FamilyMember;
  highlighted?: boolean;
  onOpen: (id: string) => void;
  onAddParent?: (id: string) => void;
  onAddChild?: (id: string) => void;
  wives?: FamilyMember[]; // ordered wives, only present for husbands
  hasDescendants?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: (id: string) => void;
  editable: boolean;
}

const genderTheme = (g: Gender) =>
  g === "male"
    ? {
        ring: "ring-sky-400/60",
        strip: "from-sky-500 via-sky-400 to-cyan-400",
        chip: "bg-sky-500/10 text-sky-600 dark:text-sky-300",
        avatarBg: "bg-gradient-to-br from-sky-500 to-cyan-400",
        handle: "!border-sky-500 !bg-card",
        border: "border-sky-200/70 dark:border-sky-500/30",
      }
    : g === "female"
      ? {
          ring: "ring-pink-400/60",
          strip: "from-pink-500 via-rose-400 to-fuchsia-400",
          chip: "bg-pink-500/10 text-pink-600 dark:text-pink-300",
          avatarBg: "bg-gradient-to-br from-pink-500 to-fuchsia-400",
          handle: "!border-pink-500 !bg-card",
          border: "border-pink-200/70 dark:border-pink-500/30",
        }
      : {
          ring: "ring-slate-400/60",
          strip: "from-slate-500 via-slate-400 to-zinc-400",
          chip: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
          avatarBg: "bg-gradient-to-br from-slate-500 to-zinc-400",
          handle: "!border-slate-500 !bg-card",
          border: "border-slate-200/70 dark:border-slate-500/30",
        };

function MemberNodeImpl({ data, selected }: NodeProps<MemberNodeData>) {
  const {
    member,
    highlighted,
    onOpen,
    onAddParent,
    onAddChild,
    wives,
    hasDescendants,
    collapsed,
    onToggleCollapsed,
    editable,
  } = data;
  const th = genderTheme(member.gender);
  const { lang, t } = useI18n();
  const [subfamilyOpen, setSubfamilyOpen] = useState(false);
  const connectorStart = useRef<{ x: number; y: number } | null>(null);
  const subfamilies = familyStore.getSubfamilies();
  const currentSubfamily = familyStore.getClosestSubfamily(member.id) ?? null;
  const canConnect = editable;

  const birthY = member.birth_date?.slice(0, 4);
  const deathY = member.death_date?.slice(0, 4);
  const startConnectorClick = (event: ReactPointerEvent) => {
    connectorStart.current = { x: event.clientX, y: event.clientY };
  };
  const finishConnectorClick = (event: ReactPointerEvent, action?: (id: string) => void) => {
    const start = connectorStart.current;
    connectorStart.current = null;
    if (!start || !action) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 4) action(member.id);
  };

  return (
    <div className="group/node relative">
      {hasDescendants && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapsed?.(member.id);
          }}
          className="nodrag nopan pointer-events-auto absolute -end-2.5 -top-2.5 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md transition hover:border-primary/40 hover:bg-accent hover:text-foreground"
          title={collapsed ? t("expand_descendants") : t("collapse_descendants")}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      )}
      <Handle
        id="parent-in"
        type="target"
        position={Position.Top}
        isConnectable={canConnect}
        onPointerDown={canConnect ? startConnectorClick : undefined}
        onPointerUp={canConnect ? (event) => finishConnectorClick(event, onAddParent) : undefined}
        className={`!-top-[18px] !h-7 !w-7 !border-2 shadow-md transition-all duration-150 hover:!scale-110 ${th.handle} ${
          canConnect
            ? selected
              ? "!opacity-100"
              : "!opacity-0 group-hover/node:!opacity-100"
            : "!pointer-events-none !opacity-0"
        }`}
      />
      <Handle
        id="child-out"
        type="source"
        position={Position.Bottom}
        isConnectable={canConnect}
        onPointerDown={canConnect ? startConnectorClick : undefined}
        onPointerUp={canConnect ? (event) => finishConnectorClick(event, onAddChild) : undefined}
        className={`!-bottom-[18px] !h-7 !w-7 !border-2 shadow-md transition-all duration-150 hover:!scale-110 ${th.handle} ${
          canConnect
            ? selected
              ? "!opacity-100"
              : "!opacity-0 group-hover/node:!opacity-100"
            : "!pointer-events-none !opacity-0"
        }`}
      />
      <Handle
        id="spouse-l"
        type="target"
        position={Position.Left}
        isConnectable={false}
        className="!pointer-events-none !h-0 !w-0 !border-0 !opacity-0"
      />
      <Handle
        id="spouse-r"
        type="source"
        position={Position.Right}
        isConnectable={false}
        className="!pointer-events-none !h-0 !w-0 !border-0 !opacity-0"
      />
      <button
        onDoubleClick={(event) => {
          event.stopPropagation();
          onOpen(member.id);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onOpen(member.id);
        }}
        className={`group relative flex w-64 flex-col overflow-hidden rounded-xl border ${th.border} bg-card text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_6px_18px_-8px_rgba(15,23,42,0.16)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-primary/35 hover:shadow-[0_2px_4px_rgba(0,0,0,0.08),0_12px_28px_-10px_rgba(15,23,42,0.22)] ${
          highlighted || selected
            ? `ring-2 ring-offset-2 ring-offset-background ${selected ? "ring-primary/70" : th.ring}`
            : ""
        }`}
      >
        <div className={`h-1 w-full bg-gradient-to-r ${th.strip}`} />
        <div className="flex items-center gap-3 p-3">
          <div className="relative shrink-0">
            {member.image_url ? (
              <img
                src={member.image_url}
                alt=""
                className="h-11 w-11 rounded-lg object-cover ring-1 ring-border"
              />
            ) : (
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-lg ${th.avatarBg} text-white shadow-sm`}
              >
                <User className="h-6 w-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-card-foreground">
              {displayName(member, lang)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
                {member.citizen_status === "non_resident" ? t("non_resident") : t("resident")}
              </span>
              {currentSubfamily ? (
                <Popover open={subfamilyOpen} onOpenChange={setSubfamilyOpen}>
                  <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button
                      disabled
                      className="pointer-events-none inline-flex cursor-default items-center gap-1 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium text-purple-600 dark:text-purple-300"
                    >
                      {displayName(currentSubfamily, lang)}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-2" onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-1 text-[10px]">
                      <button
                        onClick={() => {
                          familyStore.assignSubfamily(member.id, undefined);
                          setSubfamilyOpen(false);
                        }}
                        className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
                      >
                        {!currentSubfamily ? "✓ " : "  "}
                        {t("none")}
                      </button>
                      {subfamilies.map((sf) => (
                        <button
                          key={sf.id}
                          onClick={() => {
                            familyStore.assignSubfamily(member.id, sf.id);
                            setSubfamilyOpen(false);
                          }}
                          className="block w-full rounded px-2 py-1 text-left hover:bg-accent"
                        >
                          {currentSubfamily?.id === sf.id ? "✓ " : "  "}
                          {displayName(sf, lang)}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
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

        {member.gender === "male" && wives && wives.length > 0 && (
          <div className="border-t border-border/60 bg-muted/30 px-3 py-2">
            <div className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Heart className="h-2.5 w-2.5" />
              <span>{t("spouses")}</span>
            </div>
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
                    {years && <span className="shrink-0 opacity-70 tabular-nums">{years}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </button>
    </div>
  );
}

export const MemberNode = memo(MemberNodeImpl);
