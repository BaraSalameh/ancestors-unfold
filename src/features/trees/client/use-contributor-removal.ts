import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import { activeContributorBranches } from "../pages/dashboard-owner-controls";
import type { Branch, CurrentTree } from "../pages/dashboard-types";

interface RemovalChallenge {
  id: string;
  expires_at: string;
}

export function useContributorRemoval(
  tree: CurrentTree | undefined,
  branches: Branch[],
  reload: () => Promise<void>,
) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [contributorId, setContributorId] = useState("");
  const [challenge, setChallenge] = useState<RemovalChallenge>();
  const [code, setCode] = useState("");
  const [action, setAction] = useState<"request" | "resend" | "confirm">();
  const selectedBranch = branches.find((branch) => branch.contributor_user_id === contributorId);
  const removableBranches = activeContributorBranches(branches);
  const request = async () => {
    if (action || !tree || tree.role !== "owner" || !contributorId) return;
    setAction(challenge ? "resend" : "request");
    try {
      const response = await fetch(
        `/api/trees/${tree.id}/contributors/${contributorId}/removal-requests`,
        { method: "POST", credentials: "include" },
      );
      const body = (await response.json()) as { id?: string; expires_at?: string; code?: string };
      if (!response.ok || !body.id || !body.expires_at) {
        toast.error(
          body.code === "CONTRIBUTOR_UNAVAILABLE"
            ? t("contributor_removal_unavailable")
            : t("contributor_removal_code_failed"),
        );
        return;
      }
      setChallenge({ id: body.id, expires_at: body.expires_at });
      setCode("");
      toast.success(t("contributor_removal_code_sent"));
    } catch {
      toast.error(t("contributor_removal_code_failed"));
    } finally {
      setAction(undefined);
    }
  };
  const confirm = async () => {
    if (action || !challenge || !/^\d{6}$/.test(code)) return;
    setAction("confirm");
    try {
      const response = await fetch(`/api/contributor-removal-requests/${challenge.id}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as { code?: string };
      if (!response.ok) {
        const key =
          body.code === "INVALID_OR_EXPIRED_CODE"
            ? "contributor_removal_invalid_code"
            : body.code === "CONTRIBUTOR_UNAVAILABLE"
              ? "contributor_removal_unavailable"
              : "contributor_removal_failed";
        toast.error(t(key));
        return;
      }
      setOpen(false);
      setContributorId("");
      setChallenge(undefined);
      setCode("");
      toast.success(t("contributor_removal_completed"));
      await reload();
    } catch {
      toast.error(t("contributor_removal_failed"));
    } finally {
      setAction(undefined);
    }
  };
  return {
    open,
    setOpen,
    contributorId,
    setContributorId,
    challenge,
    setChallenge,
    code,
    setCode,
    action,
    selectedBranch,
    removableBranches,
    request,
    confirm,
  };
}

export type ContributorRemovalController = ReturnType<typeof useContributorRemoval>;
