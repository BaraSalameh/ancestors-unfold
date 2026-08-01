import { describe, expect, it } from "vitest";
import { registrationValidation } from "./auth-form";

describe("registration validation", () => {
  it("reports every missing registration requirement", () => {
    expect(registrationValidation({ email: "a@example.test", password: "" })).toEqual({
      fullNameEn: "full_name_en_required",
      fullNameAr: "full_name_ar_required",
      gender: "gender_required",
      password: "registration_password_too_short",
      confirmPassword: "passwords_do_not_match",
    });
  });

  it("accepts matching sufficiently long registration values", () => {
    expect(
      registrationValidation({
        email: "a@example.test",
        password: "long-password",
        confirmPassword: "long-password",
        fullNameEn: "English",
        fullNameAr: "Arabic",
        gender: "male",
      }),
    ).toEqual({});
  });
});
