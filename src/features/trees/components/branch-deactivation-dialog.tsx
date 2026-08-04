import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { VerificationCodeInput } from "@/shared/ui/verification-code-input";
import {
  branchDeactivationActionState,
  type BranchDeactivationPendingAction,
} from "../domain/branch-deactivation-state";
import type { Branch, CurrentTree } from "../pages/dashboard-types";

interface Challenge {
  id: string;
  expires_at: string;
}

// Both verification phases stay together so closing always clears the challenge UI.
// eslint-disable-next-line max-lines-per-function
export function BranchDeactivationDialog({
  open,
  onOpenChange,
  branch,
  tree,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: Branch;
  tree: CurrentTree;
  onSaved: () => Promise<void>;
}) {
  const { lang, t } = useI18n();
  const [confirmation, setConfirmation] = useState("");
  const [challenge, setChallenge] = useState<Challenge>();
  const [code, setCode] = useState("");
  const [pendingAction, setPendingAction] = useState<BranchDeactivationPendingAction>(null);
  const { busy, requestLoading, confirmLoading } = branchDeactivationActionState(pendingAction);
  const reset = () => {
    setConfirmation("");
    setChallenge(undefined);
    setCode("");
  };
  const changeOpen = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };
  const requestCode = async () => {
    if (busy || confirmation !== "DELETE") return;
    setPendingAction("request");
    try {
      const response = await fetch(
        `/api/trees/${tree.id}/branches/${branch.id}/deactivation-requests`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmation }),
        },
      );
      const body = (await response.json()) as Challenge & { code?: string };
      if (!response.ok || !body.id) throw new Error(body.code ?? "REQUEST_FAILED");
      setChallenge(body);
      setCode("");
      toast.success(t("branch_deactivation_code_sent"));
    } catch {
      toast.error(t("branch_deactivation_failed"));
    } finally {
      setPendingAction(null);
    }
  };
  const confirm = async () => {
    if (busy || !challenge || code.length !== 6 || confirmation !== "DELETE") return;
    setPendingAction("confirm");
    try {
      const response = await fetch(`/api/branch-deactivation-requests/${challenge.id}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmation,
          code,
          expectedVersion: tree.version,
          batchId: crypto.randomUUID(),
        }),
      });
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        toast.error(
          body.code === "INVALID_OR_EXPIRED_CODE"
            ? t("branch_deactivation_invalid_code")
            : body.code === "CONTRIBUTOR_ACCOUNT_DELETE_CONFLICT"
              ? t("contributor_removal_unavailable")
              : t("branch_deactivation_failed"),
        );
        return;
      }
      changeOpen(false);
      await onSaved();
      toast.success(t("branch_deactivated"));
    } catch {
      toast.error(t("branch_deactivation_failed"));
    } finally {
      setPendingAction(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deactivate_branch")}</DialogTitle>
        </DialogHeader>
        {!challenge ? (
          <>
            <p className="text-sm text-muted-foreground">{t("branch_deactivation_warning")}</p>
            <div className="space-y-2">
              <Label htmlFor="branch-deactivation-confirmation">
                {t("type_delete_to_confirm")}
              </Label>
              <Input
                id="branch-deactivation-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                dir="ltr"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => changeOpen(false)}>
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                loading={requestLoading}
                disabled={busy || confirmation !== "DELETE"}
                onClick={() => void requestCode()}
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
                value={code}
                onChange={setCode}
                disabled={busy}
              />
              <p className="text-xs text-muted-foreground">
                {t("verification_code_expires", {
                  time: new Date(challenge.expires_at).toLocaleTimeString(
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
                loading={requestLoading}
                disabled={busy}
                onClick={() => void requestCode()}
              >
                {t("resend_code")}
              </Button>
              <Button
                variant="destructive"
                loading={confirmLoading}
                disabled={busy || code.length !== 6}
                onClick={() => void confirm()}
              >
                {t("deactivate_branch")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
