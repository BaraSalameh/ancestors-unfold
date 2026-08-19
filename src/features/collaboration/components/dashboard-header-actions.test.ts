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

function renderActions(
  role: "owner" | "contributor",
  lang: Lang,
  affiliationStatus: "active" | "read_only" = "active",
) {
  const context = {
    lang,
    dir: lang === "ar" ? ("rtl" as const) : ("ltr" as const),
    setLang: () => undefined,
    t: (key: TranslationKey, values?: TranslationValues) => translate(lang, key, values),
  };
  const props = {
    tree: {
      id: "tree-id",
      role,
      analysis_enabled: true,
      affiliation_status: affiliationStatus,
    },
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
  const edit = markup.indexOf('data-dashboard-action="edit"');
  const add = markup.indexOf('data-dashboard-action="add-member"');
  const preview = markup.indexOf('data-dashboard-action="preview"');
  const analysis = markup.indexOf('data-dashboard-action="analysis"');
  const treeActions = markup.indexOf('data-dashboard-action="tree-actions"');

  expect(edit).toBeGreaterThanOrEqual(0);
  expect(add).toBe(-1);
  expect(preview).toBeGreaterThan(edit);
  expect(analysis).toBeGreaterThan(preview);
  expect(treeActions).toBeGreaterThan(analysis);
}

describe("dashboard header action order", () => {
  it("shows edit and preview before owner tree actions in LTR", () => {
    expectSharedOrder(renderActions("owner", "en"));
  });

  it("shows edit and preview before contributor tree actions in RTL", () => {
    expectSharedOrder(renderActions("contributor", "ar"));
  });

  it("disables only contributor editing when access is read only", () => {
    const markup = renderActions("contributor", "en", "read_only");
    expect(markup).toMatch(/data-dashboard-action="edit"[^>]*disabled/);
    expect(markup).not.toMatch(/data-dashboard-action="preview"[^>]*disabled/);
  });
});
