import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/shared/ui/input-otp";
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
      <div className="flex justify-center" dir="ltr">
        <InputOTP
          maxLength={6}
          value={controller.code}
          onChange={controller.setCode}
          inputMode="numeric"
          pattern="[0-9]*"
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot key={index} index={index} />
            ))}
          </InputOTPGroup>
        </InputOTP>
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
