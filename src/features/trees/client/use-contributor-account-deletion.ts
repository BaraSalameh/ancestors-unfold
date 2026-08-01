import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";

export function useContributorAccountDeletion() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { deleteContributorAccount, requestContributorAccountDeletionCode } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [code, setCode] = useState("");
  const [codeExpiresAt, setCodeExpiresAt] = useState<string>();
  const [action, setAction] = useState<"request" | "delete">();
  const requestCode = async () => {
    if (action || confirmation !== "DELETE") return;
    setAction("request");
    try {
      const result = await requestContributorAccountDeletionCode("DELETE");
      setCode("");
      setCodeExpiresAt(result.expiresAt);
      toast.success(t("account_deletion_code_sent"));
    } catch (error) {
      toast.error(
        (error as { code?: string }).code === "RESEND_TOO_SOON"
          ? t("resend_too_soon")
          : t("account_deletion_code_failed"),
      );
    } finally {
      setAction(undefined);
    }
  };
  const remove = async () => {
    if (action || confirmation !== "DELETE" || !/^\d{6}$/.test(code)) return;
    setAction("delete");
    try {
      await deleteContributorAccount("DELETE", code);
      await navigate({ to: "/auth", search: { redirect: "/", oauthError: undefined } });
    } catch (error) {
      toast.error(
        (error as { code?: string }).code === "INVALID_OR_EXPIRED_CODE"
          ? t("account_deletion_invalid_code")
          : t("account_delete_failed"),
      );
      setAction(undefined);
    }
  };
  return {
    open,
    setOpen,
    confirmation,
    setConfirmation,
    code,
    setCode,
    codeExpiresAt,
    action,
    requestCode,
    remove,
  };
}

export type ContributorAccountDeletionController = ReturnType<typeof useContributorAccountDeletion>;
