import { LayoutGrid, Search, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import type { FamilyMember } from "@/features/members";
import type { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { familyStore } from "../client/family-store";
import { canvasSearchResultLabel } from "./canvas-search-result";

const FamilyCsvImportDialog = lazy(() =>
  import("./family-csv-import-dialog").then(({ FamilyCsvImportDialog: component }) => ({
    default: component,
  })),
);

type I18n = ReturnType<typeof useI18n>;

export interface FamilyTreeTopbarProps {
  canAutoLayout: boolean;
  canEdit: boolean;
  canMutate: boolean;
  lang: I18n["lang"];
  matches: FamilyMember[];
  members: FamilyMember[];
  onAutoLayout: () => void;
  onFocusMember: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
  t: I18n["t"];
  csvImportOpen: boolean;
  onCsvImportOpenChange: (open: boolean) => void;
}

export function FamilyTreeTopbar(props: FamilyTreeTopbarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-4">
      <MemberSearch {...props} />
    </div>
  );
}

function MemberSearch({
  lang,
  matches,
  members,
  onFocusMember,
  query,
  setQuery,
  t,
}: FamilyTreeTopbarProps) {
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
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
            matches.map((member) => {
              const primary = canvasSearchResultLabel(member, membersById, lang);
              const alternate = canvasSearchResultLabel(
                member,
                membersById,
                lang === "ar" ? "en" : "ar",
              );
              return (
                <button
                  key={member.id}
                  onClick={() => onFocusMember(member.id)}
                  className="block w-full p-2 text-start text-sm hover:bg-accent"
                >
                  <div className="font-medium">{primary}</div>
                  {alternate && alternate !== primary ? (
                    <div className="text-xs text-muted-foreground">{alternate}</div>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export function EditToolbar({
  canAutoLayout,
  canMutate,
  onAutoLayout,
  t,
  csvImportOpen,
  onCsvImportOpenChange,
}: FamilyTreeTopbarProps) {
  const canImport = familyStore.canImportFamilyCsv();
  return (
    <>
      <div
        className="pointer-events-auto flex flex-wrap items-center justify-end gap-1 rounded-xl border border-border/80 bg-card/95 p-1 shadow-[0_4px_18px_-8px_rgba(15,23,42,0.28)] backdrop-blur"
        data-canvas-widget
      >
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
      {canImport && csvImportOpen ? (
        <Suspense fallback={null}>
          <FamilyCsvImportDialog open onOpenChange={onCsvImportOpenChange} />
        </Suspense>
      ) : null}
    </>
  );
}
