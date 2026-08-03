import { describe, expect, it } from "vitest";
import { ApiError, assertJsonRequest, assertSameOrigin, schemas } from "./security";

const member = {
  id: "member-1",
  name_en: "Example",
  name_ar: "مثال",
  gender: "male" as const,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("snapshot trust boundary", () => {
  it("accepts the current versioned snapshot contract", () => {
    expect(
      schemas.snapshot.parse({
        batchId: "2dbd0eb8-23bd-4cc4-bf83-e17eea903655",
        expectedVersion: 1,
        members: [member],
        subfamilies: [],
      }),
    ).toBeTruthy();
  });

  it("accepts an Arabic-only member name", () => {
    expect(
      schemas.snapshot.parse({
        expectedVersion: 1,
        members: [{ ...member, name_en: "", name_ar: "مثال" }],
        subfamilies: [],
      }).members[0],
    ).toMatchObject({ name_en: "", name_ar: "مثال" });
  });

  it("accepts an English-only member name", () => {
    expect(
      schemas.snapshot.parse({
        expectedVersion: 1,
        members: [{ ...member, name_en: "Example", name_ar: "" }],
        subfamilies: [],
      }).members[0],
    ).toMatchObject({ name_en: "Example", name_ar: "" });
  });

  it("rejects a member without either name", () => {
    expect(() =>
      schemas.snapshot.parse({
        expectedVersion: 1,
        members: [{ ...member, name_en: "", name_ar: "" }],
        subfamilies: [],
      }),
    ).toThrow();
  });

  it("rejects unknown properties and invalid versions", () => {
    expect(() =>
      schemas.snapshot.parse({
        expectedVersion: 0,
        members: [{ ...member, injected: true }],
        subfamilies: [],
      }),
    ).toThrow();
  });

  it("accepts HTTPS member images and rejects insecure URLs", () => {
    const snapshot = (image_url: string) => ({
      expectedVersion: 1,
      members: [{ ...member, image_url }],
      subfamilies: [],
    });
    expect(schemas.snapshot.parse(snapshot("https://example.com/profile.jpg"))).toBeTruthy();
    expect(() => schemas.snapshot.parse(snapshot("http://example.com/profile.jpg"))).toThrow();
  });

  it("accepts unknown-date deaths and legacy dated deaths but rejects contradictory status", () => {
    const snapshot = (memberPatch: Record<string, unknown>) => ({
      expectedVersion: 1,
      members: [{ ...member, ...memberPatch }],
      subfamilies: [],
    });

    expect(schemas.snapshot.parse(snapshot({ is_deceased: true }))).toBeTruthy();
    expect(schemas.snapshot.parse(snapshot({ death_date: "2020-01-02" }))).toBeTruthy();
    expect(() =>
      schemas.snapshot.parse(snapshot({ death_date: "2020-01-02", is_deceased: false })),
    ).toThrow();
  });
});

describe("HTTP security checks", () => {
  it("rejects non-JSON write bodies", () => {
    expect(() =>
      assertJsonRequest(new Request("http://localhost/api/x", { method: "POST" })),
    ).toThrow(ApiError);
  });

  it("rejects cross-origin writes", () => {
    const request = new Request("http://localhost/api/x", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    expect(() => assertSameOrigin(request)).toThrowError("CSRF_REJECTED");
  });
});

describe("registration input", () => {
  const registration = {
    email: "person@example.test",
    password: "long-password",
    fullNameEn: "English Name",
    fullNameAr: "Arabic Name",
    gender: "female" as const,
  };

  it("mirrors either supplied full name into the missing database field", () => {
    expect(schemas.register.parse({ ...registration, fullNameAr: "" })).toMatchObject({
      fullNameEn: "English Name",
      fullNameAr: "English Name",
    });
    expect(schemas.register.parse({ ...registration, fullNameEn: "" })).toMatchObject({
      fullNameEn: "Arabic Name",
      fullNameAr: "Arabic Name",
    });
  });

  it("rejects registration without either full name", () => {
    expect(() =>
      schemas.register.parse({ ...registration, fullNameEn: "", fullNameAr: "" }),
    ).toThrow();
  });
});

describe("login input", () => {
  it("requires at least 12 password characters", () => {
    expect(() =>
      schemas.login.parse({ email: "person@example.test", password: "12345678901" }),
    ).toThrow();
    expect(schemas.login.parse({ email: "person@example.test", password: "123456789012" })).toEqual(
      { email: "person@example.test", password: "123456789012" },
    );
  });
});

describe("contributor invitation input", () => {
  const invitation = {
    email: "new.contributor@example.test",
    branchId: "ca1ba620-7aa9-4e50-9e30-bd34975fcca4",
    existingFamilyMemberId: "f4c7ec45-249f-45ef-a0fd-4fc0e4e9cc4c",
  };

  it("accepts only email, branch, and an existing member card", () => {
    expect(schemas.invitation.parse(invitation)).toEqual(invitation);
  });

  it.each(["email", "branchId", "existingFamilyMemberId"] as const)("requires %s", (field) => {
    const input: Partial<typeof invitation> = { ...invitation };
    delete input[field];
    expect(() => schemas.invitation.parse(input)).toThrow();
  });

  it("rejects obsolete invitee and position fields", () => {
    expect(() =>
      schemas.invitation.parse({ ...invitation, positionLabel: "Son of branch root" }),
    ).toThrow();
  });
});

describe("profile mutation input", () => {
  it("accepts supported account genders and rejects unknown values", () => {
    expect(
      schemas.profileNames.parse({
        fullNameEn: "Anas",
        fullNameAr: "Anas",
        gender: "male",
      }).gender,
    ).toBe("male");
    expect(() =>
      schemas.profileNames.parse({
        fullNameEn: "Anas",
        fullNameAr: "Anas",
        gender: "invalid",
      }),
    ).toThrow();
  });

  it("accepts bilingual profile names and rejects blank names", () => {
    expect(schemas.profileNames.parse({ fullNameEn: "Anas", fullNameAr: "أنس" })).toEqual({
      fullNameEn: "Anas",
      fullNameAr: "أنس",
    });
    expect(() => schemas.profileNames.parse({ fullNameEn: "", fullNameAr: "أنس" })).toThrow();
  });

  it("requires the exact destructive account confirmation", () => {
    expect(schemas.deleteContributorAccountRequest.parse({ confirmation: "DELETE" })).toEqual({
      confirmation: "DELETE",
    });
    expect(() =>
      schemas.deleteContributorAccountRequest.parse({ confirmation: "delete" }),
    ).toThrow();
    expect(
      schemas.deleteContributorAccount.parse({ confirmation: "DELETE", code: "012345" }),
    ).toEqual({ confirmation: "DELETE", code: "012345" });
    expect(() =>
      schemas.deleteContributorAccount.parse({ confirmation: "DELETE", code: "12345" }),
    ).toThrow();
  });

  it("accepts only the successor identity and optional reason for an ownership transfer", () => {
    const proposedOwnerUserId = "00000000-0000-4000-8000-000000000001";
    expect(schemas.transferRequest.parse({ proposedOwnerUserId })).toEqual({
      proposedOwnerUserId,
    });
    expect(() =>
      schemas.transferRequest.parse({
        proposedOwnerUserId,
        previousOwnerBranchId: "00000000-0000-4000-8000-000000000002",
      }),
    ).toThrow();
    expect(() => schemas.transferRequest.parse({ proposedOwnerUserId: "not-a-user" })).toThrow();
  });

  it("accepts only a six-digit contributor removal code", () => {
    expect(schemas.contributorRemovalCode.parse({ code: "012345" })).toEqual({ code: "012345" });
    expect(() => schemas.contributorRemovalCode.parse({ code: "12345" })).toThrow();
    expect(() => schemas.contributorRemovalCode.parse({ code: "123456", extra: true })).toThrow();
  });
});
