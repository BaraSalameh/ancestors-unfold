import { Link } from "@tanstack/react-router";
import { Activity, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

import { activityLabel } from "@/features/trees";
import { useI18n } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

type CurrentTree = { id: string; name_en: string | null; name_ar: string | null };
type ActivityRow = {
  action_type: string;
  target_type: string;
  created_at: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error("REQUEST_FAILED");
  return response.json() as Promise<T>;
}

export function ActivityPage() {
  const { t, lang } = useI18n();
  const [tree, setTree] = useState<CurrentTree>();
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  useEffect(() => {
    void getJson<CurrentTree>("/api/tree/current").then(async (current) => {
      setTree(current);
      setActivity(await getJson<ActivityRow[]>(`/api/trees/${current.id}/activity?limit=100`));
    });
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/">
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
          {t("back")}
        </Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>
            {t("activity_history")}
            {tree ? ` — ${lang === "ar" ? tree.name_ar || tree.name_en : tree.name_en}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {activity.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("no_activity")}</p>
          )}
          {activity.map((row, index) => (
            <div
              key={`${row.created_at}-${index}`}
              className="flex items-center gap-3 border-b pb-3 last:border-0"
            >
              <Activity className="h-4 w-4 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{activityLabel(row.action_type, t)}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(row.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
