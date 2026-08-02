import { ChevronDown, ChevronUp, HelpCircle, Link2, Unlink, X } from "lucide-react";
import { wifeColorFor } from "@/features/trees/domain";
import { displayName, ordinal, useI18n } from "@/shared/i18n";
import type { FamilyMember } from "../domain/types";

interface SpouseEditorRowProps {
  wife: FamilyMember;
  index: number;
  count: number;
  divorced: boolean;
  locked?: boolean;
  onToggleDivorce: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

export function SpouseEditorRow({
  wife,
  index,
  count,
  divorced,
  locked,
  onToggleDivorce,
  onMove,
  onRemove,
}: SpouseEditorRowProps) {
  const { t, lang } = useI18n();
  const color = wifeColorFor(index);
  return (
    <div
      className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm"
      style={{ borderColor: `${color.stroke}55` }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.stroke }} />
      <span className="text-xs opacity-70">{ordinal(index + 1, lang)}</span>
      {wife.is_unknown ? (
        <span className="inline-flex items-center gap-1 italic text-muted-foreground">
          <HelpCircle className="h-3 w-3" />
          {t("unknown_wife")}
        </span>
      ) : (
        <span className="truncate">{displayName(wife, lang)}</span>
      )}
      {wife.birth_date && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {wife.birth_date.slice(0, 4)}
          {wife.death_date ? `Ã¢â‚¬â€œ${wife.death_date.slice(0, 4)}` : ""}
        </span>
      )}
      <button
        type="button"
        onClick={onToggleDivorce}
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        title={divorced ? t("mark_married") : t("mark_divorced")}
      >
        {divorced ? <Link2 className="h-3.5 w-3.5" /> : <Unlink className="h-3.5 w-3.5" />}
      </button>
      <div className="ms-auto flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => onMove(-1)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
          title={t("move_spouse_up")}
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={index === count - 1}
          onClick={() => onMove(1)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25"
          title={t("move_spouse_down")}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      {!locked && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title={t("remove_wife")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
