import { describe, expect, it } from "vitest";
import { profileThumbnailUrl } from "../domain/member-image-url";

describe("profileThumbnailUrl", () => {
  it("adds a square optimized delivery transformation to Cloudinary images", () => {
    expect(profileThumbnailUrl("https://res.cloudinary.com/demo/image/upload/v1/member.jpg")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,w_256,h_256/v1/member.jpg",
    );
  });

  it("leaves external and invalid URLs untouched", () => {
    expect(profileThumbnailUrl("https://example.com/member.jpg")).toBe(
      "https://example.com/member.jpg",
    );
    expect(profileThumbnailUrl("not a url")).toBe("not a url");
  });
});
