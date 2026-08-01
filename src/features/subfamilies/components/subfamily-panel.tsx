import { ArrowLeft } from "lucide-react";
import { familyStore, useFamily } from "@/features/trees";
import { displayName, useI18n } from "@/shared/i18n";
import { SelectedSubfamily } from "./selected-subfamily";
import { SubfamilyList } from "./subfamily-list";

interface SubfamilyPanelProps {
  selectedSubfamilyId: string | null;
  onSelectSubfamily: (id: string | null) => void;
  filterEnabled: boolean;
  onToggleFilter: (enabled: boolean) => void;
  mode?: "home" | "manage";
  hideHeading?: boolean;
  readOnly?: boolean;
  allowedSubfamilyId?: string;
}

export function SubfamilyPanel({
  selectedSubfamilyId,
  onSelectSubfamily,
  onToggleFilter,
  mode = "manage",
  hideHeading = false,
  readOnly = false,
  allowedSubfamilyId,
}: SubfamilyPanelProps) {
  const { t, lang } = useI18n();
  const members = useFamily();
  const subfamilies = familyStore
    .getSubfamilies()
    .filter((subfamily) => !allowedSubfamilyId || subfamily.id === allowedSubfamilyId);
  const selected = selectedSubfamilyId
    ? subfamilies.find(({ id }) => id === selectedSubfamilyId)
    : undefined;
  const selectedMembers = selected ? familyStore.getSubfamilyMembers(selected.id) : [];
  const maleMembers = members.filter(({ gender }) => gender === "male");
  const linkedMale = selected?.linked_male_id
    ? (maleMembers.find(({ id }) => id === selected.linked_male_id) ?? null)
    : null;
  const clearSelection = () => {
    onSelectSubfamily(null);
    onToggleFilter(false);
  };
  const selectFromList = (id: string) => {
    if (mode !== "home") return onSelectSubfamily(id);
    if (selectedSubfamilyId === id) {
      if (!allowedSubfamilyId) clearSelection();
      return;
    }
    onSelectSubfamily(id);
    onToggleFilter(true);
  };

  if (selected && mode === "home") {
    const living = selectedMembers.filter((member) => !member.death_date);
    return (
      <div className="space-y-2">
        <button onClick={clearSelection} className="text-xs hover:underline">
          <ArrowLeft className="me-1 inline h-3 w-3 rtl:rotate-180" />
          {t("back")}
        </button>
        <h3 className="font-semibold text-card-foreground">{displayName(selected, lang)}</h3>
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <div className="flex justify-between">
            <span>{t("subfamily_total")}:</span>
            <span className="font-medium">{selectedMembers.length}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("subfamily_living")}:</span>
            <span className="font-medium">{living.length}</span>
          </div>
        </div>
      </div>
    );
  }
  if (selected) {
    return (
      <SelectedSubfamily
        subfamily={selected}
        members={selectedMembers}
        maleMembers={maleMembers}
        linkedMale={linkedMale}
        readOnly={readOnly}
        allowBack={!allowedSubfamilyId}
        onBack={() => onSelectSubfamily(null)}
        onDelete={() => onSelectSubfamily(null)}
      />
    );
  }
  return (
    <SubfamilyList
      subfamilies={subfamilies}
      selectedId={selectedSubfamilyId}
      onSelect={selectFromList}
      homeMode={mode === "home"}
      hideHeading={hideHeading}
      readOnly={readOnly}
    />
  );
}
