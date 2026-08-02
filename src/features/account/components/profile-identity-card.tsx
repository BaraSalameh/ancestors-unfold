import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";
import { Alert, AlertDescription } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { profileErrorMessage } from "../domain/profile-error";

type Gender = "male" | "female" | "unspecified";

type ProfileUser = { fullNameEn: string; fullNameAr: string; gender: Gender } | null | undefined;

const profileDraft = (user: ProfileUser) => ({
  fullNameEn: user?.fullNameEn ?? "",
  fullNameAr: user?.fullNameAr ?? "",
  gender: user?.gender ?? ("unspecified" as Gender),
});

const profileUnchanged = (
  user: ProfileUser,
  fullNameEn: string,
  fullNameAr: string,
  gender: Gender,
) => {
  const current = profileDraft(user);
  return (
    fullNameEn.trim() === current.fullNameEn &&
    fullNameAr.trim() === current.fullNameAr &&
    gender === current.gender
  );
};

export function ProfileIdentityCard() {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const initial = profileDraft(user);
  const [fullNameEn, setFullNameEn] = useState(initial.fullNameEn);
  const [fullNameAr, setFullNameAr] = useState(initial.fullNameAr);
  const [gender, setGender] = useState<Gender>(initial.gender);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = profileDraft(user);
    setFullNameEn(next.fullNameEn);
    setFullNameAr(next.fullNameAr);
    setGender(next.gender);
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !fullNameEn.trim() || !fullNameAr.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateProfile(fullNameEn.trim(), fullNameAr.trim(), gender);
      toast.success(t("profile_name_updated"));
    } catch (caught) {
      setError(profileErrorMessage(caught, t));
    } finally {
      setBusy(false);
    }
  };

  const unchanged = profileUnchanged(user, fullNameEn, fullNameAr, gender);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile_name")}</CardTitle>
        <CardDescription>{t("profile_name_description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
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
            <Select value={gender} onValueChange={(value) => setGender(value as Gender)}>
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
          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button className="sm:col-span-2 sm:w-fit" loading={busy} disabled={unchanged}>
            {t("save_changes")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
