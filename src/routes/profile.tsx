import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { KeyRound, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { AuthError } from "@/lib/auth-service";
import { useI18n } from "@/lib/i18n";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile | Ancestors Unfold" }] }),
  component: ProfilePage,
});
function ProfilePage() {
  const { user, requestEmailChange, confirmEmailChange } = useAuth(),
    { t } = useI18n();
  const [email, setEmail] = useState(user?.email ?? ""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const message = (e: unknown) =>
    e instanceof AuthError && e.code === "EMAIL_EXISTS"
      ? t("email_exists")
      : e instanceof AuthError && e.code === "INVALID_CREDENTIALS"
        ? t("invalid_credentials")
        : e instanceof AuthError && e.code === "INVALID_OR_EXPIRED_CODE"
          ? t("invalid_or_expired_code")
          : e instanceof AuthError && e.code === "DELIVERY_FAILED"
            ? t("delivery_failed")
            : t("auth_error");
  const request = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestEmailChange(email, password);
      setPending(true);
      setPassword("");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await confirmEmailChange(code);
      setPending(false);
      setCode("");
      toast.success(t("email_changed"));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-7">
        <h1 className="text-3xl font-bold">{t("profile_settings")}</h1>
        <p className="mt-2 text-muted-foreground">{t("profile_description")}</p>
      </div>
      <div className="space-y-6">
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
              <div className="space-y-4">
                <p className="text-sm font-medium" dir="ltr">
                  {email}
                </p>
                <div dir="ltr">
                  <InputOTP maxLength={6} value={code} onChange={setCode} inputMode="numeric">
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <InputOTPSlot key={i} index={i} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button disabled={busy || code.length !== 6} onClick={confirm}>
                  {busy && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}
                  {t("confirm_code")}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPending(false);
                    setError(null);
                  }}
                >
                  {t("cancel")}
                </Button>
              </div>
            ) : (
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={request}>
                <div>
                  <Label>{t("full_name_en")}</Label>
                  <Input className="mt-2" value={user?.fullNameEn ?? ""} readOnly />
                </div>
                <div>
                  <Label>{t("full_name_ar")}</Label>
                  <Input className="mt-2" dir="rtl" value={user?.fullNameAr ?? ""} readOnly />
                </div>
                <div>
                  <Label htmlFor="profile-email">{t("new_email")}</Label>
                  <Input
                    id="profile-email"
                    className="mt-2"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="current-password">{t("current_password")}</Label>
                  <Input
                    id="current-password"
                    className="mt-2"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
                  disabled={busy || email.trim().toLowerCase() === (user?.email ?? "")}
                >
                  {busy && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}
                  {t("send_verification_code")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  {t("two_factor_authentication")}
                </CardTitle>
                <CardDescription className="mt-2">{t("two_factor_description")}</CardDescription>
              </div>
              <Badge variant="secondary">{t("not_enabled")}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex gap-3">
                <KeyRound className="h-5 w-5" />
                <p>{t("authenticator_app_description")}</p>
              </div>
            </div>
            <Button className="mt-4" onClick={() => toast.info(t("feature_requires_backend"))}>
              {t("enable_authenticator")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
