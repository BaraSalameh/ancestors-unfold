import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError, validatedApiRequest } from "@/shared/api/client";
import { useI18n } from "@/shared/i18n";
import { activeContributorBranches } from "../pages/dashboard-owner-controls";
import type { Branch, CurrentTree } from "../pages/dashboard-types";
import { contributorRemovalChallengeSchema, successResponseSchema } from "./response-schemas";

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
      const challengeResponse = await validatedApiRequest(
        contributorRemovalChallengeSchema,
        `/api/trees/${tree.id}/contributors/${contributorId}/removal-requests`,
        { method: "POST" },
      );
      setChallenge(challengeResponse);
      setCode("");
      toast.success(t("contributor_removal_code_sent"));
    } catch (error) {
      toast.error(
        error instanceof ApiClientError && error.code === "CONTRIBUTOR_UNAVAILABLE"
          ? t("contributor_removal_unavailable")
          : t("contributor_removal_code_failed"),
      );
    } finally {
      setAction(undefined);
    }
  };
  const confirm = async () => {
    if (action || !challenge || !/^\d{6}$/.test(code)) return;
    setAction("confirm");
    try {
      await validatedApiRequest(
        successResponseSchema,
        `/api/contributor-removal-requests/${challenge.id}/confirm`,
        { method: "POST", body: { code } },
      );
      setOpen(false);
      setContributorId("");
      setChallenge(undefined);
      setCode("");
      toast.success(t("contributor_removal_completed"));
      await reload();
    } catch (error) {
      if (error instanceof ApiClientError) {
        const key =
          error.code === "INVALID_OR_EXPIRED_CODE"
            ? "contributor_removal_invalid_code"
            : error.code === "CONTRIBUTOR_UNAVAILABLE"
              ? "contributor_removal_unavailable"
              : "contributor_removal_failed";
        toast.error(t(key));
        return;
      }
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
