import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n";
import type { DashboardTreeControls } from "../client/use-dashboard-tree-controls";
import { CountryCombobox } from "./country-combobox";

export function ManageFamilyDialog({ controller }: { controller: DashboardTreeControls }) {
  const { t } = useI18n();
  return (
    <Dialog open={controller.manageOpen} onOpenChange={controller.setManageOpen}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("manage_family")}</DialogTitle>
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tree-description-en">{t("description_en")}</Label>
            <Textarea
              id="tree-description-en"
              dir="ltr"
              value={controller.descriptionEn}
              onChange={(event) => controller.setDescriptionEn(event.target.value)}
              maxLength={5000}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tree-description-ar">{t("description_ar")}</Label>
            <Textarea
              id="tree-description-ar"
              dir="rtl"
              value={controller.descriptionAr}
              onChange={(event) => controller.setDescriptionAr(event.target.value)}
              maxLength={5000}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("country")}</Label>
            <CountryCombobox value={controller.countryCode} onChange={controller.setCountryCode} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tree-visibility">{t("visibility")}</Label>
            <Select
              value={controller.visibility}
              onValueChange={(value) =>
                controller.setVisibility(value === "public" ? "public" : "private")
              }
            >
              <SelectTrigger id="tree-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">{t("visibility_private")}</SelectItem>
                <SelectItem value="public">{t("visibility_public")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => controller.setManageOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            loading={controller.managing}
            disabled={!controller.nameEn.trim()}
            onClick={() => void controller.manage()}
          >
            {t("save_changes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
