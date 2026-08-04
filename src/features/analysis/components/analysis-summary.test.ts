import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate, type TranslationKey, type TranslationValues } from "@/locales";
import { I18nContext } from "@/shared/i18n/context";
import { overviewAgeBands } from "../domain/summary-projection";
import type { SummaryData } from "../domain/types";
import { AnalysisSummary } from "./analysis-summary";

const summary: SummaryData = {
  total: 20,
  living: 18,
  deceased: 2,
  male: 9,
  female: 9,
  adults: 16,
  living_adults: 14,
  minors: 3,
  unknown_age: 1,
  resident: 10,
  non_resident: 8,
  average_age: null,
  median_age: null,
  average_lifespan: null,
  maximum_generation_depth: 4,
  oldest_member: null,
  youngest_member: null,
  age_bands: [
    { key: "60", count: 2 },
    { key: "70", count: 3 },
  ],
  birth_decades: [],
  death_decades: [{ key: "unknown", count: 2 }],
};

describe("analysis overview summary", () => {
  it("combines every age band from 60 onward into one 60+ bucket", () => {
    expect(
      overviewAgeBands([
        { key: "50", count: 4 },
        { key: "60", count: 2 },
        { key: "70", count: 3 },
        { key: "80", count: 1 },
        { key: "unknown", count: 2 },
      ]),
    ).toEqual([
      { key: "50", count: 4 },
      { key: "60_plus", count: 6 },
      { key: "unknown", count: 2 },
    ]);
  });

  it("shows the living-adult count consistently in the stat and demographics cards", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nContext.Provider,
        {
          value: {
            lang: "en",
            dir: "ltr",
            setLang: () => undefined,
            t: (key: TranslationKey, values?: TranslationValues) => translate("en", key, values),
          },
        },
        createElement(AnalysisSummary, { summary }),
      ),
    );

    expect(markup.match(/>14<\/div>/g)).toHaveLength(2);
    expect(markup).not.toContain(">16</div>");
    expect(markup).toContain("60+");
    expect(markup).not.toContain("70–79");
    expect(markup).toContain(">Unknown</span>");
    expect(markup).toContain("Maximum generation depth");
    expect(markup).not.toContain("roots are generation 0");
    expect(markup).toContain(">4</div>");
  });
});
