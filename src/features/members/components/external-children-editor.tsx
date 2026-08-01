import { Plus, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useI18n } from "@/shared/i18n";
import type { ExternalChild } from "../domain/types";

interface ExternalChildrenEditorProps {
  value: ExternalChild[];
  onChange: (value: ExternalChild[]) => void;
}

export function ExternalChildrenEditor({ value, onChange }: ExternalChildrenEditorProps) {
  const { t } = useI18n();
  const add = () =>
    onChange([...value, { id: crypto.randomUUID(), name: "", other_parent_name: "" }]);
  const patch = (id: string, change: Partial<ExternalChild>) =>
    onChange(value.map((child) => (child.id === id ? { ...child, ...change } : child)));
  const remove = (id: string) => onChange(value.filter((child) => child.id !== id));

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Label className="flex items-center gap-1.5 text-sm font-semibold">
            <UserPlus className="h-4 w-4 text-amber-600" />
            {t("external_children")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("external_children_desc")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          {t("add_row")}
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          {value.map((child) => (
            <div
              key={child.id}
              className="grid gap-2 rounded-md border bg-card p-2 sm:grid-cols-[1fr_1fr_auto]"
            >
              <Input
                value={child.name}
                onChange={(event) => patch(child.id, { name: event.target.value })}
                placeholder={t("child_name")}
              />
              <Input
                value={child.other_parent_name ?? ""}
                onChange={(event) => patch(child.id, { other_parent_name: event.target.value })}
                placeholder={t("other_parent")}
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remove(child.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
