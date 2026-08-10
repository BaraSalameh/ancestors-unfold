import { describe, expect, it, vi } from "vitest";
import { canvasWidgetTarget } from "./canvas-widget-target";

describe("canvasWidgetTarget", () => {
  it("recognizes actual widget surfaces", () => {
    const widget = {} as Element;
    const closest = vi.fn().mockReturnValue(widget);
    expect(canvasWidgetTarget({ closest } as unknown as EventTarget)).toBe(widget);
    expect(closest).toHaveBeenCalledWith(expect.stringContaining("[data-canvas-widget]"));
  });

  it("lets transparent panel gaps fall through", () => {
    expect(
      canvasWidgetTarget({ closest: vi.fn().mockReturnValue(null) } as unknown as EventTarget),
    ).toBeNull();
  });
});
