import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useI18n } from "@/shared/i18n";
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";

export function TreeRenameDialog({ controller }: { controller: DashboardTreeControls }) {
  const { t } = useI18n();
  return (
    <Dialog open={controller.renameOpen} onOpenChange={controller.setRenameOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("update_family_tree")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tree-name-en">{t("family_name_en")}</Label>
            <Input
              id="tree-name-en"
              autoFocus
              dir="ltr"
              value={controller.nameEn}
              onChange={(event) => controller.setNameEn(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tree-name-ar">
              {t("family_name_ar")}{" "}
              <span className="font-normal text-muted-foreground">{t("optional")}</span>
            </Label>
            <Input
              id="tree-name-ar"
              dir="rtl"
              value={controller.nameAr}
              onChange={(event) => controller.setNameAr(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => controller.setRenameOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            loading={controller.renaming}
            disabled={!controller.nameEn.trim()}
            onClick={() => void controller.rename()}
          >
            {t("save_changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
