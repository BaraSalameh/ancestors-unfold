import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { VerificationCodeInput } from "@/shared/ui/verification-code-input";
import type { Branch, CurrentTree } from "@/features/collaboration";
import { useBranchDeactivation } from "../client/use-branch-deactivation";

export function BranchDeactivationDialog({
  open,
  onOpenChange,
  branch,
  branches,
  tree,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: Branch;
  branches?: Branch[];
  tree: CurrentTree;
  onSaved: () => Promise<void>;
}) {
  const { lang, t } = useI18n();
  const action = useBranchDeactivation({ branch, branches, tree, onSaved, onOpenChange });
  return (
    <Dialog open={open} onOpenChange={action.changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(action.bulk ? "deactivate_selected_branches" : "deactivate_branch", {
              count: action.targets.length,
            })}
          </DialogTitle>
        </DialogHeader>
        {!action.challenge ? (
          <>
            <p className="text-sm text-muted-foreground">
              {t(action.bulk ? "branches_deactivation_warning" : "branch_deactivation_warning", {
                count: action.targets.length,
              })}
            </p>
            <div className="space-y-2">
              <Label htmlFor="branch-deactivation-confirmation">
                {t("type_delete_to_confirm")}
              </Label>
              <Input
                id="branch-deactivation-confirmation"
                value={action.confirmation}
                onChange={(event) => action.setConfirmation(event.target.value)}
                autoComplete="off"
                dir="ltr"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => action.changeOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                loading={action.requestLoading}
                disabled={action.busy || action.confirmation !== "DELETE"}
                onClick={() => void action.requestCode()}
              >
                {t("send_verification_code")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="branch-deactivation-code">{t("verification_code")}</Label>
              <VerificationCodeInput
                id="branch-deactivation-code"
                value={action.code}
                onChange={action.setCode}
                disabled={action.busy}
              />
              <p className="text-xs text-muted-foreground">
                {t("verification_code_expires", {
                  time: new Date(action.challenge.expires_at).toLocaleTimeString(
                    lang === "ar" ? "ar" : "en",
                    {
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  ),
                })}
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                loading={action.requestLoading}
                disabled={action.busy}
                onClick={() => void action.requestCode()}
              >
                {t("resend_code")}
              </Button>
              <Button
                variant="destructive"
                loading={action.confirmLoading}
                disabled={action.busy || action.code.length !== 6}
                onClick={() => void action.confirm()}
              >
                {t(action.bulk ? "deactivate_selected_branches" : "deactivate_branch", {
                  count: action.targets.length,
                })}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
