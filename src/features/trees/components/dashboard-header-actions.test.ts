import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate, type Lang, type TranslationKey, type TranslationValues } from "@/locales";
import { I18nContext } from "@/shared/i18n/context";
import { DashboardHeaderActions } from "./dashboard-header-actions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    "data-dashboard-action": dashboardAction,
  }: {
    children?: ReactNode;
    "data-dashboard-action"?: string;
  }) => createElement("a", { "data-dashboard-action": dashboardAction }, children),
}));

function renderActions(role: "owner" | "contributor", lang: Lang) {
  const context = {
    lang,
    dir: lang === "ar" ? ("rtl" as const) : ("ltr" as const),
    setLang: () => undefined,
    t: (key: TranslationKey, values?: TranslationValues) => translate(lang, key, values),
  };
  const props = {
    tree: { id: "tree-id", role, analysis_enabled: true },
    treeControls: {},
    accountDeletion: { setOpen: () => undefined },
    invitation: { setInviteOpen: () => undefined },
    transfer: { setOpen: () => undefined },
    removal: { removableBranches: [], setOpen: () => undefined },
    ownershipTransfer: null,
  } as unknown as ComponentProps<typeof DashboardHeaderActions>;
  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        I18nContext.Provider,
        { value: context },
        createElement(DashboardHeaderActions, props),
      ),
    ),
  );
}

function expectSharedOrder(markup: string) {
  const analysis = markup.indexOf('data-dashboard-action="analysis"');
  const treeActions = markup.indexOf('data-dashboard-action="tree-actions"');
  const edit = markup.indexOf('data-dashboard-action="edit"');

  expect(analysis).toBeGreaterThanOrEqual(0);
  expect(treeActions).toBeGreaterThan(analysis);
  expect(edit).toBeGreaterThan(treeActions);
}

describe("dashboard header action order", () => {
  it("places owner tree actions before edit in LTR", () => {
    expectSharedOrder(renderActions("owner", "en"));
  });

  it("places contributor tree actions before edit in RTL", () => {
    expectSharedOrder(renderActions("contributor", "ar"));
  });
});
