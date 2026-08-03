import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { translate, type TranslationKey, type TranslationValues } from "@/locales";
import { I18nContext } from "@/shared/i18n/context";
import type { AnalysisEnvelope, AnalysisQueryDefinition, SavedAnalysisView } from "../domain/types";
import { AnalysisSavedViews } from "./analysis-saved-views";

const treeId = "00000000-0000-4000-8000-000000000001";
const definition: AnalysisQueryDefinition = { filters: {}, sort: "name", direction: "asc" };

function renderViews(data: SavedAnalysisView[]) {
  const queryClient = new QueryClient();
  const response: AnalysisEnvelope<SavedAnalysisView[]> = {
    schema_version: 1,
    as_of_date: "2026-08-03",
    scope: {
      kind: "tree",
      treeId,
      treeNameEn: "Family",
      treeNameAr: null,
      branchId: null,
      branchNameEn: null,
      branchNameAr: null,
      role: "contributor",
    },
    data,
  };
  queryClient.setQueryData(["analysis-views", treeId], response);
  const context = {
    lang: "en" as const,
    dir: "ltr" as const,
    setLang: () => undefined,
    t: (key: TranslationKey, values?: TranslationValues) => translate("en", key, values),
  };
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        I18nContext.Provider,
        { value: context },
        createElement(AnalysisSavedViews, {
          treeId,
          definition,
          onApply: () => undefined,
        }),
      ),
    ),
  );
}

describe("analysis saved views", () => {
  it("shows management controls only for views the current collaborator can manage", () => {
    const common = {
      definition,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-02T00:00:00.000Z",
    };
    const markup = renderViews([
      { ...common, id: "view-1", name: "Mine", can_manage: true },
      { ...common, id: "view-2", name: "Shared", can_manage: false },
    ]);

    expect(markup).toContain("Mine");
    expect(markup).toContain("Shared");
    expect(markup.match(/aria-label="Delete"/g)).toHaveLength(1);
    expect(markup.match(/>Apply</g)).toHaveLength(2);
  });
});
