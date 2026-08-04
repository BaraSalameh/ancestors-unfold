import type { SummaryData } from "./types";

export function overviewAgeBands(items: SummaryData["age_bands"]) {
  const projected: SummaryData["age_bands"] = [];
  let sixtyPlus = 0;
  let hasSixtyPlus = false;
  let unknown: SummaryData["age_bands"][number] | undefined;

  for (const item of items) {
    if (item.key === "unknown") {
      unknown = item;
      continue;
    }
    const start = Number(item.key);
    if (Number.isFinite(start) && start >= 60) {
      sixtyPlus += item.count;
      hasSixtyPlus = true;
    } else {
      projected.push(item);
    }
  }

  if (hasSixtyPlus) projected.push({ key: "60_plus", count: sixtyPlus });
  if (unknown) projected.push(unknown);
  return projected;
}
