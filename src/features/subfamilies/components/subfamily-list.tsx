import { useState } from "react";
import { familyStore, newBranchConflicts } from "@/features/trees";
import type { SubFamily } from "@/features/members";
import { displayName, useI18n } from "@/shared/i18n";
import { toast } from "sonner";

export function SubfamilyList({
  subfamilies,
  selectedId,
  onSelect,
  homeMode,
  hideHeading,
  readOnly,
}: {
  subfamilies: SubFamily[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  homeMode: boolean;
  hideHeading: boolean;
  readOnly: boolean;
}) {
  const { t, lang } = useI18n();
  const [newName, setNewName] = useState("");
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const current = familyStore.getSubfamilies();
    const conflict = newBranchConflicts(current, [
      ...current,
      { id: "new", name_en: name, name_ar: name },
    ])[0];
    if (conflict) {
      toast.error(t("duplicate_branch_name"));
      return;
    }
    const created = familyStore.addSubfamily(name, name);
    setNewName("");
    onSelect(created.id);
  };
  return (
    <div className="space-y-2">
      {!hideHeading && <div className="font-semibold text-card-foreground">{t("subfamilies")}</div>}
      {subfamilies.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">{t("none")}</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {subfamilies.map((subfamily) => {
            const count = familyStore.getSubfamilyMembers(subfamily.id).length;
            return (
              <button
                key={subfamily.id}
                onClick={() => onSelect(subfamily.id)}
                className={`h-6 rounded-md border bg-background px-2 py-0.5 text-[10px] hover:bg-accent ${selectedId === subfamily.id ? "border-primary bg-primary/10 text-primary" : ""}`}
              >
                {displayName(subfamily, lang)} ({count})
              </button>
            );
          })}
        </div>
      )}
      {!homeMode && !readOnly && (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyPress={(event) => event.key === "Enter" && add()}
              placeholder={t("add_subfamily")}
              className="flex-1 rounded border bg-background px-2 py-1 text-[10px]"
            />
            <button
              type="button"
              onClick={add}
              disabled={!newName.trim()}
              className="rounded border bg-primary px-2 py-1 text-[10px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              +
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">{t("select_linked_male")}</p>
        </div>
      )}
    </div>
  );
}
