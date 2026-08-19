import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ApiClientError, validatedApiRequest } from "@/shared/api/client";
import { useI18n } from "@/shared/i18n";
import type { Branch, CurrentTree } from "@/features/collaboration";
import {
  branchDeactivationActionState,
  type BranchDeactivationPendingAction,
} from "../domain/branch-deactivation-state";

const challengeSchema = z.object({ id: z.string().uuid(), expires_at: z.string() });
const confirmationSchema = z.object({ ok: z.literal(true), version: z.number().int().positive() });

export function useBranchDeactivation({
  branch,
  branches,
  tree,
  onSaved,
  onOpenChange,
}: {
  branch: Branch;
  branches?: Branch[];
  tree: CurrentTree;
  onSaved: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const targets = branches ?? [branch];
  const bulk = targets.length > 1;
  const [confirmation, setConfirmation] = useState("");
  const [challenge, setChallenge] = useState<z.infer<typeof challengeSchema>>();
  const [code, setCode] = useState("");
  const [pendingAction, setPendingAction] = useState<BranchDeactivationPendingAction>(null);
  const actionState = branchDeactivationActionState(pendingAction);
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
    if (actionState.busy || confirmation !== "DELETE") return;
    setPendingAction("request");
    try {
      const path = bulk
        ? `/api/trees/${tree.id}/branches/deactivation-requests`
        : `/api/trees/${tree.id}/branches/${branch.id}/deactivation-requests`;
      const next = await validatedApiRequest(challengeSchema, path, {
        method: "POST",
        body: {
          confirmation,
          ...(bulk ? { branchIds: targets.map(({ id }) => id) } : {}),
        },
      });
      setChallenge(next);
      setCode("");
      toast.success(t("branch_deactivation_code_sent"));
    } catch {
      toast.error(t("branch_deactivation_failed"));
    } finally {
      setPendingAction(null);
    }
  };
  const confirm = async () => {
    if (actionState.busy || !challenge || code.length !== 6 || confirmation !== "DELETE") return;
    setPendingAction("confirm");
    try {
      await validatedApiRequest(
        confirmationSchema,
        `/api/branch-deactivation-requests/${challenge.id}/confirm`,
        {
          method: "POST",
          body: {
            confirmation,
            code,
            expectedVersion: tree.version,
            batchId: crypto.randomUUID(),
          },
        },
      );
      changeOpen(false);
      await onSaved();
      toast.success(
        t(bulk ? "branches_deactivated" : "branch_deactivated", { count: targets.length }),
      );
    } catch (error) {
      const errorCode = error instanceof ApiClientError ? error.code : "REQUEST_FAILED";
      if (errorCode === "INVALID_OR_EXPIRED_CODE")
        toast.error(t("branch_deactivation_invalid_code"));
      else if (errorCode === "CONTRIBUTOR_ACCOUNT_DELETE_CONFLICT")
        toast.error(t("contributor_removal_unavailable"));
      else toast.error(t("branch_deactivation_failed"));
    } finally {
      setPendingAction(null);
    }
  };
  return {
    ...actionState,
    bulk,
    targets,
    confirmation,
    setConfirmation,
    challenge,
    code,
    setCode,
    changeOpen,
    requestCode,
    confirm,
  };
}
