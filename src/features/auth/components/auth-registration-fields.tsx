import { UserRound } from "lucide-react";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { useI18n } from "@/shared/i18n";
import type { AuthPageController } from "../client/use-auth-page";
import { AuthField } from "./auth-field";

type TranslationKey = Parameters<ReturnType<typeof useI18n>["t"]>[0];

function FormError({ message }: { message?: string }) {
  const { t } = useI18n();
  return message ? (
    <p className="mt-2 text-sm text-destructive">{t(message as TranslationKey)}</p>
  ) : null;
}

export function AuthRegistrationFields({ controller }: { controller: AuthPageController }) {
  const { t } = useI18n();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField label={t("full_name_en")} icon={<UserRound />}>
          <Input dir="ltr" {...controller.form.register("fullNameEn")} />
        </AuthField>
        <AuthField label={t("full_name_ar")} icon={<UserRound />}>
          <Input dir="rtl" {...controller.form.register("fullNameAr")} />
        </AuthField>
      </div>
      <div>
        <Label>{t("gender")}</Label>
        <Select
          value={controller.form.watch("gender")}
          onValueChange={(value) =>
            controller.form.setValue("gender", value as "male" | "female", { shouldValidate: true })
          }
        >
          <SelectTrigger className="mt-2">
            <SelectValue placeholder={t("gender_required")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">{t("male")}</SelectItem>
            <SelectItem value="female">{t("female")}</SelectItem>
          </SelectContent>
        </Select>
        <FormError message={controller.form.formState.errors.gender?.message} />
      </div>
    </>
  );
}

export { FormError };
