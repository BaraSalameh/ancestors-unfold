import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardPageSkeleton, RoutePageSkeleton, TreeLoadingIndicator } from "./page-skeletons";
import { pageSkeletonKind } from "./page-skeleton-kind";

describe("page skeleton routing", () => {
  it.each([
    ["/", "dashboard"],
    ["/activity", "activity"],
    ["/profile", "profile"],
    ["/settings", "settings"],
    ["/subfamilies", "subfamilies"],
    ["/branches", "branches"],
    ["/add", "add-member"],
    ["/tree/tree-1/add", "add-member"],
    ["/edit/member-1", "edit-member"],
    ["/member/member-1", "member"],
    ["/tree/tree-1", "tree"],
    ["/auth", "auth"],
    ["/reset-password", "reset-password"],
    ["/invitation/token", "invitation"],
  ] as const)("maps %s to its %s skeleton", (path, expected) => {
    expect(pageSkeletonKind(path)).toBe(expected);
  });

  it("renders distinct owner and contributor dashboard structures", () => {
    const owner = renderToStaticMarkup(
      createElement(DashboardPageSkeleton, { label: "Loading", role: "owner" }),
    );
    const contributor = renderToStaticMarkup(
      createElement(DashboardPageSkeleton, { label: "Loading", role: "contributor" }),
    );

    expect(owner).toContain('data-dashboard-skeleton="owner"');
    expect(contributor).toContain('data-dashboard-skeleton="contributor"');
    expect(owner.match(/rounded-xl border bg-card p-6 shadow-sm/g)?.length).toBeGreaterThan(
      contributor.match(/rounded-xl border bg-card p-6 shadow-sm/g)?.length ?? 0,
    );
    expect(owner).toContain("lg:grid-cols-3");
    expect(contributor).toContain("lg:grid-cols-3");
  });

  it("reserves the tree canvas geometry while the editor loads", () => {
    const direct = renderToStaticMarkup(
      createElement(TreeLoadingIndicator, { label: "Loading tree" }),
    );
    const routed = renderToStaticMarkup(
      createElement(RoutePageSkeleton, {
        pathname: "/tree/tree-1",
        label: "Loading tree",
      }),
    );

    for (const markup of [direct, routed]) {
      expect(markup).toContain("data-tree-skeleton");
      expect(markup).toContain('role="status"');
      expect(markup).toContain("Loading tree");
      expect(markup).toContain("animate-pulse");
      expect(markup).toContain("h-[calc(100vh-3.5rem)]");
    }
  });
});
