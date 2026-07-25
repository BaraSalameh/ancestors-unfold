import { describe, expect, it } from "vitest";
import { accountDisplayName } from "./account-name";

const user = {
  fullNameEn: "Maya Saleh",
  fullNameAr: "مايا صالح",
  email: "maya@example.com",
};

describe("accountDisplayName", () => {
  it("uses the name matching the current language", () => {
    expect(accountDisplayName(user, "en")).toBe("Maya Saleh");
    expect(accountDisplayName(user, "ar")).toBe("مايا صالح");
  });

  it("falls back to the other language and then email", () => {
    expect(accountDisplayName({ ...user, fullNameAr: "" }, "ar")).toBe("Maya Saleh");
    expect(accountDisplayName({ ...user, fullNameEn: "", fullNameAr: "" }, "en")).toBe(
      "maya@example.com",
    );
  });

  it("returns an empty value while no session user is available", () => {
    expect(accountDisplayName(null, "en")).toBe("");
  });
});
