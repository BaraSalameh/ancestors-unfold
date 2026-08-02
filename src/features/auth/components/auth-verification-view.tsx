import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { VerificationCodeInput } from "@/shared/ui/verification-code-input";
import { useI18n } from "@/shared/i18n";
import type { AuthPageController } from "../client/use-auth-page";

export function AuthVerificationView({
  controller,
  error,
}: {
  controller: AuthPageController;
  error: string | null;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-5">
      <p className="text-center text-sm font-medium" dir="ltr">
        {controller.pendingEmail}
      </p>
      <div className="flex justify-center">
        <VerificationCodeInput value={controller.code} onChange={controller.setCode} />
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        className="w-full"
        loading={controller.busyAction === "verify"}
        disabled={Boolean(controller.busyAction) || controller.code.length !== 6}
        onClick={controller.verify}
      >
        {t("confirm_code")}
      </Button>
      <Button
        variant="ghost"
        className="w-full"
        loading={controller.busyAction === "resend"}
        disabled={Boolean(controller.busyAction)}
        onClick={controller.resend}
      >
        {t("resend_code")}
      </Button>
      <Button variant="link" className="w-full" onClick={controller.backToLogin}>
        {t("back_to_login")}
      </Button>
    </div>
  );
}
