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

  it("uses the tree spinner without skeleton placeholders", () => {
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
      expect(markup).toContain("animate-spin");
      expect(markup).toContain('role="status"');
      expect(markup).toContain("Loading tree");
      expect(markup).not.toContain("animate-pulse");
    }
  });
});
