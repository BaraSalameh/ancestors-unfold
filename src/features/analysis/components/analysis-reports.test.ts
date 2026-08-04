import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate, type Lang, type TranslationKey, type TranslationValues } from "@/locales";
import { I18nContext } from "@/shared/i18n/context";
import type { QualityReportData, RelationshipReportData } from "../domain/types";
import { QualityReport, RelationshipReport } from "./analysis-reports";

const relationships: RelationshipReportData = {
  total_members: 30,
  parent_links: 22,
  zero_parents: 8,
  one_parent: 4,
  two_parents: 18,
  roots: 8,
  leaves: 12,
  no_children_recorded: 12,
  largest_recorded_child_count: 7,
  unions: 10,
  active_unions: 7,
  divorced_unions: 3,
  maximum_generation_depth: 5,
  married_males: 7,
  divorced_males: 3,
  single_males_18_24: 2,
  single_males_25_plus: 4,
  married_males_no_children: 1,
};

const quality: QualityReportData = {
  total: 30,
  missing_name_en: 0,
  missing_name_ar: 1,
  missing_birth_date: 2,
  missing_branch: 3,
  missing_image: 4,
  unknown_placeholders: 0,
  no_parents_recorded: 6,
  missing_parent: 9,
  possible_duplicate_groups: 0,
  contradictory_dates: 0,
  graph_cycles: 0,
};

function renderReport(lang: Lang, component: React.ReactNode) {
  return renderToStaticMarkup(
    createElement(
      I18nContext.Provider,
      {
        value: {
          lang,
          dir: lang === "ar" ? "rtl" : "ltr",
          setLang: () => undefined,
          t: (key: TranslationKey, values?: TranslationValues) => translate(lang, key, values),
        },
      },
      component,
    ),
  );
}

describe("analysis report widgets", () => {
  it("renders only the five requested relationship widgets and two single age rows", () => {
    const markup = renderReport("en", createElement(RelationshipReport, { data: relationships }));

    for (const label of [
      "Total members",
      "Married",
      "Divorce",
      "Single",
      "No children recorded",
      "Age 18–24",
      "Age 25+",
    ])
      expect(markup).toContain(label);

    expect(markup).toContain("Living males with at least one current recorded marriage.");
    expect(markup).toContain("Living males with no recorded marriage, grouped by age.");
    expect(markup).not.toContain("Parent-child links");
    expect(markup).not.toContain("Recorded unions");
    expect(markup).not.toContain("Maximum generation depth");
  });

  it("renders bilingual relationship descriptions", () => {
    const markup = renderReport("ar", createElement(RelationshipReport, { data: relationships }));

    expect(markup).toContain("المتزوجون");
    expect(markup).toContain("الذكور الأحياء الذين لديهم زواج مسجل حالي واحد على الأقل.");
    expect(markup).toContain("العمر 18–24");
  });

  it("replaces the old no-parents quality widget with Missing parent", () => {
    const markup = renderReport("en", createElement(QualityReport, { data: quality }));

    expect(markup).toContain("Missing parent");
    expect(markup).not.toContain("Members with fewer than two recorded parents.");
    expect(markup).toContain(">9</div>");
    expect(markup).not.toContain("No parents recorded");
    expect(markup).not.toContain(">6</div>");
  });
});
