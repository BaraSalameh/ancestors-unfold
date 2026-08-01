import { LayoutGrid, Search, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { FamilyMember } from "@/features/members";
import { memberNameWithBirthYear } from "@/features/members";
import type { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { familyStore } from "../client/family-store";

type I18n = ReturnType<typeof useI18n>;

export interface FamilyTreeTopbarProps {
  canAutoLayout: boolean;
  canEdit: boolean;
  canMutate: boolean;
  lang: I18n["lang"];
  matches: FamilyMember[];
  onAutoLayout: () => void;
  onFocusMember: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
  t: I18n["t"];
}

export function FamilyTreeTopbar(props: FamilyTreeTopbarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 p-4">
      <MemberSearch {...props} />
      {props.canEdit && <EditToolbar {...props} />}
    </div>
  );
}

function MemberSearch({ lang, matches, onFocusMember, query, setQuery, t }: FamilyTreeTopbarProps) {
  return (
    <div className="pointer-events-auto w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search_placeholder")}
          className="h-10 rounded-xl border-border/80 bg-card/95 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.28)] backdrop-blur ltr:pl-9 rtl:pr-9"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground ltr:right-3 rtl:left-3"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {query && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border bg-popover/98 p-1 shadow-xl backdrop-blur">
          {matches.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">{t("no_results")}</div>
          ) : (
            matches.map((member) => (
              <button
                key={member.id}
                onClick={() => onFocusMember(member.id)}
                className="block w-full p-2 text-start text-sm hover:bg-accent"
              >
                <div className="font-medium">{memberNameWithBirthYear(member, lang)}</div>
                <div className="text-xs text-muted-foreground">
                  {lang === "ar" ? member.name_en : member.name_ar}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EditToolbar({ canAutoLayout, canMutate, onAutoLayout, t }: FamilyTreeTopbarProps) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 rounded-xl border border-border/80 bg-card/95 p-1 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.28)] backdrop-blur">
      <Button asChild size="sm" variant="ghost">
        <Link to="/">{t("back_to_dashboard")}</Link>
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => familyStore.undo()}
        disabled={!canMutate || !familyStore.canUndo()}
        className="shadow-none"
      >
        {t("undo")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => familyStore.redo()}
        disabled={!canMutate || !familyStore.canRedo()}
        className="shadow-none"
      >
        {t("redo")}
      </Button>
      {canAutoLayout && (
        <Button size="sm" variant="ghost" onClick={onAutoLayout} className="gap-1.5 shadow-none">
          <LayoutGrid className="h-3.5 w-3.5" />
          {t("auto_layout")}
        </Button>
      )}
    </div>
  );
}
