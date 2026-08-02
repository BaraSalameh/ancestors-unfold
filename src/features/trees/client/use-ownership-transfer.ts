import { useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/shared/i18n";
import type { CurrentTree, OwnershipTransfer } from "../pages/dashboard-types";

type TransferAction = "request" | "verify" | "resend" | "accept" | "reject" | "cancel";

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(((await response.json()) as { code?: string }).code);
}

export function useOwnershipTransfer(
  tree: CurrentTree | undefined,
  transfer: OwnershipTransfer | null,
  reload: () => Promise<void>,
  invalidate: () => void,
) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");
  const [action, setAction] = useState<TransferAction>();
  const request = async () => {
    if (action || !tree || !userId) return;
    setAction("request");
    try {
      await post(`/api/trees/${tree.id}/ownership-transfers`, { proposedOwnerUserId: userId });
      toast.success(t("ownership_transfer_code_sent"));
      await reload();
    } catch {
      toast.error(t("ownership_transfer_failed"));
    } finally {
      setAction(undefined);
    }
  };
  const verify = async () => {
    if (action || !transfer || !/^\d{6}$/.test(code)) return;
    setAction("verify");
    try {
      await post(`/api/ownership-transfers/${transfer.id}/verify`, { code });
      setCode("");
      toast.success(t("ownership_transfer_verified"));
      await reload();
      setOpen(false);
    } catch {
      toast.error(t("ownership_transfer_invalid_code"));
    } finally {
      setAction(undefined);
    }
  };
  const resend = async () => {
    if (action || !transfer || transfer.verified) return;
    setAction("resend");
    try {
      await post(`/api/ownership-transfers/${transfer.id}/resend-code`);
      setCode("");
      toast.success(t("ownership_transfer_code_sent"));
      await reload();
    } catch {
      toast.error(t("ownership_transfer_failed"));
    } finally {
      setAction(undefined);
    }
  };
  const act = async (nextAction: "accept" | "reject" | "cancel") => {
    if (action || !transfer) return;
    setAction(nextAction);
    try {
      await post(`/api/ownership-transfers/${transfer.id}/${nextAction}`);
      invalidate();
      const key =
        nextAction === "accept"
          ? "ownership_transfer_accepted"
          : nextAction === "reject"
            ? "ownership_transfer_rejected"
            : "ownership_transfer_canceled";
      toast.success(t(key));
      await reload();
    } catch {
      toast.error(t("ownership_transfer_failed"));
    } finally {
      setAction(undefined);
    }
  };
  return { open, setOpen, userId, setUserId, code, setCode, action, request, verify, resend, act };
}

export type OwnershipTransferController = ReturnType<typeof useOwnershipTransfer>;
