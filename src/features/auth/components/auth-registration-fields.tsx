import { UserRound } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n";
import type { AuthPageController } from "../client/use-auth-page";
import { AuthField } from "./auth-field";

type TranslationKey = Parameters<ReturnType<typeof useI18n>["t"]>[0];

function FormError({ id, message }: { id?: string; message?: string }) {
  const { t } = useI18n();
  return message ? (
    <p id={id} role="alert" className="mt-2 text-sm text-destructive">
      {t(message as TranslationKey)}
    </p>
  ) : null;
}

export function AuthRegistrationFields({ controller }: { controller: AuthPageController }) {
  const { t } = useI18n();
  const nameError = controller.form.formState.errors.fullNameEn?.message;
  const genderError = controller.form.formState.errors.gender?.message;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField label={t("full_name_en")} htmlFor="full-name-en" icon={<UserRound />}>
          <Input
            id="full-name-en"
            dir="ltr"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "full-name-error" : undefined}
            {...controller.form.register("fullNameEn")}
          />
        </AuthField>
        <AuthField label={t("full_name_ar")} htmlFor="full-name-ar" icon={<UserRound />}>
          <Input
            id="full-name-ar"
            dir="rtl"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "full-name-error" : undefined}
            {...controller.form.register("fullNameAr")}
          />
        </AuthField>
      </div>
      <FormError id="full-name-error" message={nameError} />
      <div>
        <Label htmlFor="registration-gender">{t("gender")}</Label>
        <Select
          value={controller.form.watch("gender")}
          onValueChange={(value) =>
            controller.form.setValue("gender", value as "male" | "female", {
              shouldValidate: controller.form.formState.isSubmitted,
            })
          }
        >
          <SelectTrigger
            id="registration-gender"
            className="mt-2"
            aria-invalid={Boolean(genderError)}
            aria-describedby={genderError ? "gender-error" : undefined}
          >
            <SelectValue placeholder={t("gender_required")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">{t("male")}</SelectItem>
            <SelectItem value="female">{t("female")}</SelectItem>
          </SelectContent>
        </Select>
        <FormError id="gender-error" message={genderError} />
      </div>
    </>
  );
}

export { FormError };
