import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("keeps its label and exposes disabled busy semantics while loading", () => {
    const markup = renderToStaticMarkup(createElement(Button, { loading: true }, "Save changes"));

    expect(markup).toContain("Save changes");
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("animate-spin");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("preserves validation-based disabled state when not loading", () => {
    const markup = renderToStaticMarkup(createElement(Button, { disabled: true }, "Submit"));

    expect(markup).toContain("disabled");
    expect(markup).not.toContain("aria-busy");
    expect(markup).not.toContain("animate-spin");
  });
});
