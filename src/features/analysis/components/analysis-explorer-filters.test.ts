import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate, type Lang, type TranslationKey, type TranslationValues } from "@/locales";
import { I18nContext } from "@/shared/i18n/context";
import type { AnalysisQueryDefinition } from "../domain/types";
import { AnalysisFilterPanel } from "./analysis-explorer-filters";

function renderFilters(lang: Lang, definition: AnalysisQueryDefinition) {
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
      createElement(AnalysisFilterPanel, {
        definition,
        branches: [],
        exporting: null,
        patchFilters: () => undefined,
        setDefinition: () => undefined,
        exportFile: () => undefined,
      }),
    ),
  );
}

describe("analysis explorer filters", () => {
  const definition: AnalysisQueryDefinition = {
    filters: {},
    sort: "name",
    direction: "asc",
  };

  it("renders a disabled clear action when filters are empty", () => {
    const markup = renderFilters("en", definition);

    expect(markup).toContain("Clear filters");
    expect(markup).toContain("Exclude wives");
    expect(markup).toContain('id="analysis-exclude-wives"');
    expect(markup).toContain('disabled=""');
  });

  it("renders checked wife exclusion and Arabic labels", () => {
    const markup = renderFilters("ar", {
      ...definition,
      filters: { excludeWives: true },
    });

    expect(markup).toContain("مسح عوامل التصفية");
    expect(markup).toContain("استبعاد الزوجات");
    expect(markup).toContain('checked=""');
    expect(markup).not.toContain('disabled=""');
  });
});
