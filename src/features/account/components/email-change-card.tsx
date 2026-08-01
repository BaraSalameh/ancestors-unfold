import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/shared/ui/input-otp";
import { Label } from "@/shared/ui/label";
import { PasswordInput } from "@/shared/ui/password-input";
import { profileErrorMessage } from "../domain/profile-error";

export function EmailChangeCard() {
  const { user, requestEmailChange, confirmEmailChange } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(profileErrorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  };
  const request = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await requestEmailChange(email, password);
      setPending(true);
      setPassword("");
    });
  };
  const confirm = () =>
    run(async () => {
      await confirmEmailChange(code);
      setPending(false);
      setCode("");
      toast.success(t("email_changed"));
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          {t("account_information")}
        </CardTitle>
        <CardDescription>
          {pending ? t("verification_sent") : t("change_email_description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pending ? (
          <EmailCodeForm
            email={email}
            code={code}
            busy={busy}
            error={error}
            setCode={setCode}
            confirm={() => void confirm()}
            cancel={() => {
              setPending(false);
              setError(null);
            }}
          />
        ) : (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={request}>
            <div>
              <Label htmlFor="profile-email">{t("new_email")}</Label>
              <Input
                id="profile-email"
                className="mt-2"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="current-password">{t("current_password")}</Label>
              <PasswordInput
                id="current-password"
                wrapperClassName="mt-2"
                showLabel={t("show_password")}
                hideLabel={t("hide_password")}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            {error && (
              <Alert variant="destructive" className="sm:col-span-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              className="sm:col-span-2 sm:w-fit"
              loading={busy}
              disabled={email.trim().toLowerCase() === (user?.email ?? "")}
            >
              {t("send_verification_code")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function EmailCodeForm({
  email,
  code,
  busy,
  error,
  setCode,
  confirm,
  cancel,
}: {
  email: string;
  code: string;
  busy: boolean;
  error: string | null;
  setCode: (value: string) => void;
  confirm: () => void;
  cancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <p className="text-sm font-medium" dir="ltr">
        {email}
      </p>
      <div dir="ltr">
        <InputOTP maxLength={6} value={code} onChange={setCode} inputMode="numeric">
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
      <Button loading={busy} disabled={code.length !== 6} onClick={confirm}>
        {t("confirm_code")}
      </Button>
      <Button variant="ghost" onClick={cancel}>
        {t("cancel")}
      </Button>
    </div>
  );
}
