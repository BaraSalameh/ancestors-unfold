import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { VerificationCodeInput } from "@/shared/ui/verification-code-input";
import { useI18n } from "@/shared/i18n";
import type { ContributorAccountDeletionController } from "../client/use-contributor-account-deletion";

export function ContributorAccountDeletionDialog({
  controller,
}: {
  controller: ContributorAccountDeletionController;
}) {
  const { t, lang } = useI18n();
  return (
    <AlertDialog open={controller.open} onOpenChange={controller.setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("delete_contributor_account")}</AlertDialogTitle>
          <AlertDialogDescription>{t("delete_contributor_account_desc")}</AlertDialogDescription>
        </AlertDialogHeader>
        {!controller.codeExpiresAt ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="delete-account-confirmation">{t("type_delete_to_confirm")}</Label>
              <Input
                id="delete-account-confirmation"
                value={controller.confirmation}
                onChange={(event) => controller.setConfirmation(event.target.value)}
                autoComplete="off"
                dir="ltr"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <Button
                variant="destructive"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                loading={controller.action === "request"}
                disabled={Boolean(controller.action) || controller.confirmation !== "DELETE"}
                onClick={(event) => {
                  event.preventDefault();
                  void controller.requestCode();
                }}
              >
                {t("send_verification_code")}
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="delete-account-code">{t("verification_code")}</Label>
              <VerificationCodeInput
                id="delete-account-code"
                value={controller.code}
                onChange={controller.setCode}
                disabled={Boolean(controller.action)}
              />
              <p className="text-xs text-muted-foreground">{t("account_deletion_code_desc")}</p>
              <p className="text-xs text-muted-foreground">
                {t("verification_code_expires", {
                  time: new Date(controller.codeExpiresAt).toLocaleTimeString(
                    lang === "ar" ? "ar" : "en",
                    { hour: "2-digit", minute: "2-digit" },
                  ),
                })}
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <Button
                variant="outline"
                loading={controller.action === "request"}
                disabled={Boolean(controller.action)}
                onClick={() => void controller.requestCode()}
              >
                {t("resend_code")}
              </Button>
              <Button
                variant="destructive"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                loading={controller.action === "delete"}
                disabled={Boolean(controller.action) || controller.code.length !== 6}
                onClick={(event) => {
                  event.preventDefault();
                  void controller.remove();
                }}
              >
                {t("delete_account")}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
