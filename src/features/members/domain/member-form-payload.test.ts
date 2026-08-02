import { describe, expect, it } from "vitest";
import { initialMemberFormDraft, memberFormPayload } from "./member-form-payload";

describe("member form payload", () => {
  it("requires at least one localized name", () => {
    expect(memberFormPayload(initialMemberFormDraft(), true)).toEqual({
      ok: false,
      error: "name_required",
    });
  });

  it("rejects non-HTTPS image URLs", () => {
    const draft = initialMemberFormDraft({ name_en: "Name", image_url: "http://example.test/a" });
    expect(memberFormPayload(draft, true)).toEqual({ ok: false, error: "image_url_invalid" });
  });

  it("trims optional values and omits spouse and detached image metadata when requested", () => {
    const draft = initialMemberFormDraft({
      name_en: " Name ",
      name_ar: " ",
      notes: " Notes ",
      spouse_id: "spouse",
      image_public_id: "stale-public-id",
    });
    expect(memberFormPayload(draft, false)).toEqual({
      ok: true,
      payload: expect.objectContaining({
        name_en: "Name",
        name_ar: "",
        notes: "Notes",
        image_public_id: undefined,
      }),
    });
    const result = memberFormPayload(draft, false);
    if (result.ok) expect(result.payload).not.toHaveProperty("spouse_id");
  });
});
