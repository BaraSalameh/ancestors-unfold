import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VerificationCodeInput } from "./verification-code-input";
import { normalizeVerificationCode } from "./verification-code-value";

describe("verification code input", () => {
  it("renders six separated numeric one-time-code slots", () => {
    const markup = renderToStaticMarkup(
      createElement(VerificationCodeInput, {
        id: "code",
        value: "12",
        onChange: () => undefined,
      }),
    );

    expect(markup.match(/data-slot="verification-code-slot"/g)).toHaveLength(6);
    expect(markup).toContain('id="code"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('autoComplete="one-time-code"');
  });

  it("accepts only the first six ASCII digits", () => {
    expect(normalizeVerificationCode("12a3-4567")).toBe("123456");
  });
});
