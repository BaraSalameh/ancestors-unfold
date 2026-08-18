const widgetSelector = "input, textarea, select, button, [role='dialog'], [data-canvas-widget]";

export function canvasWidgetTarget(target: EventTarget | null): Element | null {
  if (!target || typeof (target as Element).closest !== "function") return null;
  return (target as Element).closest(widgetSelector);
}
