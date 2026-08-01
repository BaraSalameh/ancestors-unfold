import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Heart, HelpCircle, Plus } from "lucide-react";
import { familyStore } from "@/features/trees/client";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { useI18n } from "@/shared/i18n";
import { linkedSpouseIds, linkedSpouses, spouseSearchResults } from "../domain/spouse-editor";
import type { FamilyMember } from "../domain/types";
import { SpouseEditorRow } from "./spouse-editor-row";
import { SpouseSearch } from "./spouse-search";

export function SpousesEditor({
  maleId,
  allMembers,
}: {
  maleId: string;
  allMembers: FamilyMember[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const male = allMembers.find((member) => member.id === maleId) ?? familyStore.get(maleId);
  const linkedIds = useMemo(
    () =>
      linkedSpouseIds(
        maleId,
        male ? [...allMembers.filter((member) => member.id !== maleId), male] : allMembers,
      ),
    [maleId, male, allMembers],
  );
  const wives = useMemo(
    () => linkedSpouses(linkedIds, allMembers, (id) => familyStore.get(id)),
    [linkedIds, allMembers],
  );
  const results = useMemo(() => spouseSearchResults(query, allMembers), [query, allMembers]);
  const addExisting = (wifeId: string) => {
    familyStore.addSpouse(maleId, wifeId);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-pink-500" />
        <Label className="text-sm font-semibold">{t("spouses")}</Label>
      </div>
      {wives.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {wives.map((wife, index) => (
            <SpouseEditorRow
              key={wife.id}
              male={male}
              maleId={maleId}
              wife={wife}
              index={index}
              count={wives.length}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild type="button" size="sm">
          <Link to="/add" search={{ spouseId: maleId }}>
            <Plus className="h-3.5 w-3.5" />
            {t("add_spouse")}
          </Link>
        </Button>
        <SpouseSearch
          open={open}
          onOpenChange={setOpen}
          query={query}
          onQueryChange={setQuery}
          results={results}
          linkedIds={linkedIds}
          onSelect={addExisting}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() => familyStore.addUnknownSpouse(maleId)}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {t("add_spouse_unknown")}
        </Button>
      </div>
    </div>
  );
}
