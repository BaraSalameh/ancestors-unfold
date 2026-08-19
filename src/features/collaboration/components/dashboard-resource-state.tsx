import { RotateCw } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

export function DashboardResourceState({
  error,
  pending,
  retry,
  rows = 2,
}: {
  error: boolean;
  pending: boolean;
  retry: () => void;
  rows?: number;
}) {
  const { t } = useI18n();
  if (error) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
        <span>{t("dashboard_section_unavailable")}</span>
        <Button variant="ghost" size="sm" onClick={retry}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (!pending) return null;
  return (
    <div className="space-y-3" role="status">
      <span className="sr-only">{t("loading")}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}
