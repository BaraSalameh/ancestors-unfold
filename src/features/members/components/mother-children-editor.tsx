import { ChevronDown, Users } from "lucide-react";
import { familyStore } from "@/features/trees/client";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Label } from "@/shared/ui/label";
import { childrenEligibleForMother } from "../domain/mother-children";
import type { FamilyMember } from "../domain/types";

export function MotherChildrenEditor({
  motherId,
  members,
}: {
  motherId: string;
  members: FamilyMember[];
}) {
  const { t, lang } = useI18n();
  const children = childrenEligibleForMother(members, motherId);
  const linkedCount = children.filter((child) => child.mother_id === motherId).length;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <Label className="text-sm font-semibold">{t("link_children")}</Label>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between">
            <span>{t("linked_children_count", { count: linkedCount })}</span>
            <ChevronDown className="h-4 w-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
          {children.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {t("no_children_available")}
            </p>
          ) : (
            children.map((child) => (
              <DropdownMenuCheckboxItem
                key={child.id}
                checked={child.mother_id === motherId}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  familyStore.setMother(child.id, checked ? motherId : undefined)
                }
              >
                <span className="truncate">
                  {(lang === "ar" ? child.name_ar : child.name_en) ||
                    (lang === "ar" ? child.name_en : child.name_ar)}
                </span>
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
