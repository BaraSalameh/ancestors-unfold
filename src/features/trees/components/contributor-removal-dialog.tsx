import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { VerificationCodeInput } from "@/shared/ui/verification-code-input";
import { useI18n } from "@/shared/i18n";
import type { ContributorRemovalController } from "../client/use-contributor-removal";

export function ContributorRemovalDialog({
  controller,
  local,
}: {
  controller: ContributorRemovalController;
  local: (en?: string | null, ar?: string | null) => string;
}) {
  const { t, lang } = useI18n();
  const changeOpen = (open: boolean) => {
    controller.setOpen(open);
    if (!open) {
      controller.setContributorId("");
      controller.setChallenge(undefined);
      controller.setCode("");
    }
  };
  return (
    <Dialog open={controller.open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancel_contributor_contribution")}</DialogTitle>
        </DialogHeader>
        {!controller.challenge ? (
          <>
            <p className="text-sm text-muted-foreground">{t("select_contributor_to_cancel")}</p>
            <div className="space-y-2">
              {controller.removableBranches.map((branch) => (
                <button
                  type="button"
                  key={branch.id}
                  className={`w-full rounded-lg border p-4 text-start ${controller.contributorId === branch.contributor_user_id ? "border-destructive bg-destructive/5" : ""}`}
                  onClick={() => controller.setContributorId(branch.contributor_user_id ?? "")}
                >
                  <span className="block font-medium">
                    {local(branch.contributor_name_en, branch.contributor_name_ar)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {local(branch.name_en, branch.name_ar)}
                  </span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => controller.setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                loading={controller.action === "request"}
                disabled={!controller.contributorId || Boolean(controller.action)}
                onClick={() => void controller.request()}
              >
                {t("send_verification_code")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("contributor_removal_code_desc", {
                name: local(
                  controller.selectedBranch?.contributor_name_en,
                  controller.selectedBranch?.contributor_name_ar,
                ),
                branch: local(
                  controller.selectedBranch?.name_en,
                  controller.selectedBranch?.name_ar,
                ),
              })}
            </p>
            <div className="space-y-2">
              <Label htmlFor="contributor-removal-code">{t("verification_code")}</Label>
              <VerificationCodeInput
                id="contributor-removal-code"
                value={controller.code}
                onChange={controller.setCode}
                disabled={Boolean(controller.action)}
              />
              <p className="text-xs text-muted-foreground">
                {t("verification_code_expires", {
                  time: new Date(controller.challenge.expires_at).toLocaleTimeString(
                    lang === "ar" ? "ar" : "en",
                    { hour: "2-digit", minute: "2-digit" },
                  ),
                })}
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                loading={controller.action === "resend"}
                disabled={Boolean(controller.action)}
                onClick={() => void controller.request()}
              >
                {t("resend_code")}
              </Button>
              <Button
                variant="destructive"
                loading={controller.action === "confirm"}
                disabled={Boolean(controller.action) || controller.code.length !== 6}
                onClick={() => void controller.confirm()}
              >
                {t("confirm_contributor_removal")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
