import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useI18n } from "@/shared/i18n";
import type { OwnershipTransferController } from "../client/use-ownership-transfer";
import type { Branch, OwnershipTransfer } from "../pages/dashboard-types";

export function OwnershipTransferDialog({
  controller,
  transfer,
  branches,
  local,
}: {
  controller: OwnershipTransferController;
  transfer: OwnershipTransfer | null;
  branches: Branch[];
  local: (en?: string | null, ar?: string | null) => string;
}) {
  const { t, lang } = useI18n();
  return (
    <Dialog open={controller.open} onOpenChange={controller.setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("transfer_ownership")}</DialogTitle>
        </DialogHeader>
        {!transfer ? (
          <>
            <p className="text-sm text-muted-foreground">{t("transfer_ownership_desc")}</p>
            <div className="space-y-2">
              {branches.map((branch) => (
                <button
                  type="button"
                  key={branch.id}
                  className={`w-full rounded-lg border p-4 text-start ${controller.userId === branch.contributor_user_id ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => controller.setUserId(branch.contributor_user_id ?? "")}
                >
                  <span className="block font-medium">
                    {local(branch.contributor_name_en, branch.contributor_name_ar)}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {t("former_owner_receives_branch", {
                      branch: local(branch.name_en, branch.name_ar),
                    })}
                  </span>
                </button>
              ))}
              {branches.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("no_eligible_contributors")}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => controller.setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                loading={controller.action === "request"}
                disabled={!controller.userId || Boolean(controller.action)}
                onClick={() => void controller.request()}
              >
                {t("send_verification_code")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("ownership_transfer_code_desc", {
                name: local(transfer.proposed_owner_name_en, transfer.proposed_owner_name_ar),
              })}
            </p>
            <div className="space-y-2">
              <Label htmlFor="ownership-transfer-code">{t("verification_code")}</Label>
              <Input
                id="ownership-transfer-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                maxLength={6}
                value={controller.code}
                onChange={(event) =>
                  controller.setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
              />
              {transfer.verification_expires_at && (
                <p className="text-xs text-muted-foreground">
                  {t("verification_code_expires", {
                    time: new Date(transfer.verification_expires_at).toLocaleTimeString(
                      lang === "ar" ? "ar" : "en",
                      { hour: "2-digit", minute: "2-digit" },
                    ),
                  })}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                loading={controller.action === "resend"}
                disabled={Boolean(controller.action)}
                onClick={() => void controller.resend()}
              >
                {t("resend_code")}
              </Button>
              <Button
                loading={controller.action === "verify"}
                disabled={Boolean(controller.action) || controller.code.length !== 6}
                onClick={() => void controller.verify()}
              >
                {t("verify_transfer")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
