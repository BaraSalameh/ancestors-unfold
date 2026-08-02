import type { DistributionItem } from "../domain/types";

export function AnalysisBars({
  items,
  label,
}: {
  items: DistributionItem[];
  label: (key: string) => string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  if (!items.length) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key}>
          <div className="mb-1 flex justify-between gap-3 text-xs">
            <span>{label(item.key)}</span>
            <span className="font-semibold tabular-nums">{item.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.max(3, (item.count / maximum) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
