import { z } from "zod";

export const authFormSchema = z.object({
  email: z.string().trim().min(1, "email_required").email("email_invalid"),
  password: z.string(),
  confirmPassword: z.string().optional(),
  fullNameEn: z.string().optional(),
  fullNameAr: z.string().optional(),
  gender: z.enum(["male", "female"]).optional(),
});

export type AuthFormValues = z.infer<typeof authFormSchema>;
export type AuthMode = "login" | "register";
export type AuthView = "auth" | "verify" | "forgot" | "forgot-sent";
export type AuthBusyAction = "verify" | "resend" | "forgot";

export interface InvitationPrefill {
  invited_email: string;
  invited_name_en: string;
  invited_name_ar: string;
  member_gender: "male" | "female" | "unspecified";
}

export function registrationValidation(
  values: AuthFormValues,
): Partial<Record<keyof AuthFormValues, string>> {
  const errors: Partial<Record<keyof AuthFormValues, string>> = {};
  if (!values.fullNameEn?.trim()) errors.fullNameEn = "full_name_en_required";
  if (!values.fullNameAr?.trim()) errors.fullNameAr = "full_name_ar_required";
  if (!values.gender) errors.gender = "gender_required";
  if (values.password.length < 12) errors.password = "registration_password_too_short";
  if (values.password !== values.confirmPassword) errors.confirmPassword = "passwords_do_not_match";
  return errors;
}
