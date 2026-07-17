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
