import { describe, expect, it, vi } from "vitest";
import { containMemberFormSubmit } from "./use-member-form";

describe("member form submission", () => {
  it("contains nested dialog submissions within their own form", () => {
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    containMemberFormSubmit(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });
});
