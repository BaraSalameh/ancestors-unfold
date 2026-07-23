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
