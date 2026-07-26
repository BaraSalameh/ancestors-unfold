import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthError, useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { PasswordInput } from "@/shared/ui/password-input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/shared/ui/input-otp";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

export function ProfilePage() {
  const { user, requestEmailChange, confirmEmailChange, updateProfile } = useAuth(),
    { t } = useI18n();
  const [email, setEmail] = useState(user?.email ?? ""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [nameBusy, setNameBusy] = useState(false),
    [fullNameEn, setFullNameEn] = useState(user?.fullNameEn ?? ""),
    [fullNameAr, setFullNameAr] = useState(user?.fullNameAr ?? ""),
    [gender, setGender] = useState(user?.gender ?? "unspecified"),
    [role, setRole] = useState<"owner" | "contributor">(),
    [profileError, setProfileError] = useState<string | null>(null),
    [accountError, setAccountError] = useState<string | null>(null);
  useEffect(() => {
    setFullNameEn(user?.fullNameEn ?? "");
    setFullNameAr(user?.fullNameAr ?? "");
    setGender(user?.gender ?? "unspecified");
  }, [user?.fullNameEn, user?.fullNameAr, user?.gender]);
  useEffect(() => {
    void fetch("/api/tree/current", { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;
        const current = (await response.json()) as { role: "owner" | "contributor" };
        setRole(current.role);
      })
      .catch(() => undefined);
  }, []);
  const message = (e: unknown) =>
    e instanceof AuthError && e.code === "EMAIL_EXISTS"
      ? t("email_exists")
      : e instanceof AuthError && e.code === "INCORRECT_PASSWORD"
        ? t("incorrect_password")
        : e instanceof AuthError && e.code === "CONTRIBUTOR_EMAIL_CHANGE_FORBIDDEN"
          ? t("contributor_email_change_forbidden")
          : e instanceof AuthError && e.code === "INVALID_OR_EXPIRED_CODE"
            ? t("invalid_or_expired_code")
            : e instanceof AuthError && e.code === "DELIVERY_FAILED"
              ? t("delivery_failed")
              : t("auth_error");
  const request = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setAccountError(null);
    try {
      await requestEmailChange(email, password);
      setPending(true);
      setPassword("");
    } catch (e) {
      setAccountError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    setAccountError(null);
    try {
      await confirmEmailChange(code);
      setPending(false);
      setCode("");
      toast.success(t("email_changed"));
    } catch (e) {
      setAccountError(message(e));
    } finally {
      setBusy(false);
    }
  };
  const saveProfileNames = async (event: FormEvent) => {
    event.preventDefault();
    if (!fullNameEn.trim() || !fullNameAr.trim()) return;
    setNameBusy(true);
    setProfileError(null);
    try {
      await updateProfile(fullNameEn.trim(), fullNameAr.trim(), gender);
      toast.success(t("profile_name_updated"));
    } catch (caught) {
      setProfileError(message(caught));
    } finally {
      setNameBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-7">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="h-4 w-4 ltr:mr-2 rtl:ml-2 rtl:rotate-180" />
          {t("back")}
        </Button>
        <h1 className="text-3xl font-bold">{t("profile_settings")}</h1>
        <p className="mt-2 text-muted-foreground">{t("profile_description")}</p>
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile_name")}</CardTitle>
            <CardDescription>{t("profile_name_description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveProfileNames}>
              <div>
                <Label htmlFor="profile-name-en">{t("full_name_en")}</Label>
                <Input
                  id="profile-name-en"
                  className="mt-2"
                  dir="ltr"
                  value={fullNameEn}
                  onChange={(event) => setFullNameEn(event.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="profile-name-ar">{t("full_name_ar")}</Label>
                <Input
                  id="profile-name-ar"
                  className="mt-2"
                  dir="rtl"
                  value={fullNameAr}
                  onChange={(event) => setFullNameAr(event.target.value)}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label>{t("gender")}</Label>
                <Select
                  value={gender}
                  onValueChange={(value) => setGender(value as "male" | "female" | "unspecified")}
                >
                  <SelectTrigger className="mt-2 sm:max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unspecified">{t("gender_unspecified")}</SelectItem>
                    <SelectItem value="male">{t("male")}</SelectItem>
                    <SelectItem value="female">{t("female")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {profileError && (
                <Alert variant="destructive" className="sm:col-span-2">
                  <AlertDescription>{profileError}</AlertDescription>
                </Alert>
              )}
              <Button
                className="sm:col-span-2 sm:w-fit"
                disabled={
                  nameBusy ||
                  (fullNameEn.trim() === (user?.fullNameEn ?? "") &&
                    fullNameAr.trim() === (user?.fullNameAr ?? "") &&
                    gender === (user?.gender ?? "unspecified"))
                }
              >
                {nameBusy && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}
                {t("save_changes")}
              </Button>
            </form>
          </CardContent>
        </Card>
        {role === "owner" && (
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
                  {accountError && (
                    <Alert variant="destructive">
                      <AlertDescription>{accountError}</AlertDescription>
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
                      setAccountError(null);
                    }}
                  >
                    {t("cancel")}
                  </Button>
                </div>
              ) : (
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={request}>
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
                    <PasswordInput
                      id="current-password"
                      wrapperClassName="mt-2"
                      showLabel={t("show_password")}
                      hideLabel={t("hide_password")}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  {accountError && (
                    <Alert variant="destructive" className="sm:col-span-2">
                      <AlertDescription>{accountError}</AlertDescription>
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
        )}
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
