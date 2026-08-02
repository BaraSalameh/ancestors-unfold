import { useMemo, useState } from "react";
import { Heart, HelpCircle, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { useI18n } from "@/shared/i18n";
import {
  existingStagedSpouse,
  moveStagedSpouse,
  stagedSpouseMember,
  type StagedSpouse,
} from "../domain/staged-spouse";
import { spouseSearchResults } from "../domain/spouse-editor";
import type { FamilyMember, MemberInput } from "../domain/types";
import { MemberForm } from "../ui/member-form";
import { SpouseEditorRow } from "./spouse-editor-row";
import { SpouseSearch } from "./spouse-search";

export function StagedSpousesEditor({
  value,
  onChange,
  members,
}: {
  value: StagedSpouse[];
  onChange: (value: StagedSpouse[]) => void;
  members: FamilyMember[];
}) {
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const linkedIds = useMemo(
    () => new Set(value.flatMap((spouse) => (spouse.memberId ? [spouse.memberId] : []))),
    [value],
  );
  const results = useMemo(() => spouseSearchResults(query, members), [query, members]);
  const rows = value.flatMap((spouse) => {
    const member = stagedSpouseMember(spouse, members);
    return member ? [{ spouse, member }] : [];
  });

  const update = (key: string, patch: Partial<StagedSpouse>) =>
    onChange(value.map((spouse) => (spouse.key === key ? { ...spouse, ...patch } : spouse)));
  const addNew = (input: MemberInput, imageFile?: File) => {
    onChange([
      ...value,
      { key: crypto.randomUUID(), kind: "new", input, imageFile, divorced: false },
    ]);
    setDialogOpen(false);
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-pink-500" />
        <Label className="text-sm font-semibold">{t("spouses")}</Label>
      </div>
      {rows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {rows.map(({ spouse, member }, index) => (
            <SpouseEditorRow
              key={spouse.key}
              wife={member}
              index={index}
              count={rows.length}
              divorced={spouse.divorced}
              locked={spouse.locked}
              onToggleDivorce={() => update(spouse.key, { divorced: !spouse.divorced })}
              onMove={(direction) => onChange(moveStagedSpouse(value, spouse.key, direction))}
              onRemove={() => onChange(value.filter(({ key }) => key !== spouse.key))}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          {t("add_spouse")}
        </Button>
        <SpouseSearch
          open={searchOpen}
          onOpenChange={setSearchOpen}
          query={query}
          onQueryChange={setQuery}
          results={results}
          linkedIds={linkedIds}
          onSelect={(memberId) => {
            onChange([...value, existingStagedSpouse(memberId)]);
            setQuery("");
            setSearchOpen(false);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() =>
            onChange([...value, { key: crypto.randomUUID(), kind: "unknown", divorced: false }])
          }
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {t("add_spouse_unknown")}
        </Button>
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("add_spouse")}</DialogTitle>
          </DialogHeader>
          <MemberForm
            initial={{ gender: "female" }}
            members={members}
            lockedGender="female"
            relationshipFields={false}
            submitLabel={t("save")}
            onCancel={() => setDialogOpen(false)}
            onSubmit={addNew}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
