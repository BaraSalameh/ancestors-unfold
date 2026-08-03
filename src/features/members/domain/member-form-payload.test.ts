import { describe, expect, it } from "vitest";
import {
  initialMemberFormDraft,
  memberFormPayload,
  withDeathDate,
  withDeceasedStatus,
} from "./member-form-payload";

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

  it("supports deceased members without a known death date", () => {
    const draft = initialMemberFormDraft({ name_en: "Name", is_deceased: true });
    const result = memberFormPayload(draft, false);

    expect(draft).toMatchObject({ is_deceased: true, death_date: "" });
    expect(result).toEqual({
      ok: true,
      payload: expect.objectContaining({ is_deceased: true, death_date: undefined }),
    });
  });

  it("keeps the checkbox and death date coherent", () => {
    const living = initialMemberFormDraft({ name_en: "Name" });
    const dated = withDeathDate(living, "2020-01-02");
    const cleared = withDeceasedStatus(dated, false);

    expect(dated).toMatchObject({ is_deceased: true, death_date: "2020-01-02" });
    expect(cleared).toMatchObject({ is_deceased: false, death_date: "" });
    expect(
      initialMemberFormDraft({ name_en: "Legacy", death_date: "1999-03-04" }).is_deceased,
    ).toBe(true);
  });
});
