import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate, type Lang, type TranslationKey, type TranslationValues } from "@/locales";
import { I18nContext } from "@/shared/i18n/context";
import { AnalysisExcludeWivesControl } from "./analysis-exclude-wives-control";

function renderControl(lang: Lang, checked: boolean, disabled = false) {
  const context = {
    lang,
    dir: lang === "ar" ? ("rtl" as const) : ("ltr" as const),
    setLang: () => undefined,
    t: (key: TranslationKey, values?: TranslationValues) => translate(lang, key, values),
  };
  return renderToStaticMarkup(
    createElement(
      I18nContext.Provider,
      { value: context },
      createElement(AnalysisExcludeWivesControl, {
        checked,
        disabled,
        onChange: () => undefined,
      }),
    ),
  );
}

describe("shared analysis wife exclusion", () => {
  it("renders the unchecked English control", () => {
    const markup = renderControl("en", false);
    expect(markup).toContain("Exclude wives");
    expect(markup).toContain('id="analysis-exclude-wives"');
    expect(markup).not.toContain('checked=""');
  });

  it("renders the checked Arabic control", () => {
    const markup = renderControl("ar", true);
    expect(markup).toContain("استبعاد الزوجات");
    expect(markup).toContain('checked=""');
  });

  it("renders an unchecked disabled control for the relationships tab", () => {
    const markup = renderControl("en", false, true);
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).not.toContain('checked=""');
  });
});
