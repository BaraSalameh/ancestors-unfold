import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivityRowsSkeleton,
  DashboardPageSkeleton,
  LoadingStatus,
} from "@/shared/ui/page-skeletons";
import { Skeleton } from "@/shared/ui/skeleton";

describe("Skeleton", () => {
  it("composes sizing classes with accessible decorative defaults", () => {
    const markup = renderToStaticMarkup(createElement(Skeleton, { className: "h-8 w-24" }));

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("animate-pulse");
    expect(markup).toContain("motion-reduce:animate-none");
    expect(markup).toContain("h-8 w-24");
  });

  it("exposes loading copy only through a polite status", () => {
    const markup = renderToStaticMarkup(createElement(LoadingStatus, { label: "Loading tree" }));

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("sr-only");
    expect(markup).toContain("Loading tree");
  });

  it("keeps page-shaped placeholders decorative around one loading status", () => {
    const markup = renderToStaticMarkup(
      createElement(DashboardPageSkeleton, { label: "Loading dashboard" }),
    );

    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain("Loading dashboard");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("renders the requested number of activity placeholder rows", () => {
    const markup = renderToStaticMarkup(createElement(ActivityRowsSkeleton, { count: 3 }));

    expect(markup.match(/border-b/g)).toHaveLength(3);
  });
});
