import { CalendarDays, HeartPulse, UserRoundCheck, UsersRound } from "lucide-react";
import { useI18n } from "@/shared/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import type { SummaryData } from "../domain/types";
import { AnalysisBars } from "./analysis-bars";

function SummaryStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</span>
        <div>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalysisSummary({ summary }: { summary: SummaryData }) {
  const { t, lang } = useI18n();
  const ageLabels: Record<string, string> = {
    under_18: t("analysis_under_18"),
    "18_29": "18–29",
    "30_44": "30–44",
    "45_59": "45–59",
    "60_74": "60–74",
    "75_plus": "75+",
    unknown: t("analysis_unknown"),
  };
  const highlight = (member: SummaryData["oldest_member"]) =>
    member
      ? `${lang === "ar" ? member.name_ar || member.name_en : member.name_en || member.name_ar} (${member.age})`
      : "—";
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat
          label={t("analysis_total_members")}
          value={summary.total}
          icon={<UsersRound className="h-5 w-5" />}
        />
        <SummaryStat
          label={t("living")}
          value={summary.living}
          icon={<HeartPulse className="h-5 w-5" />}
        />
        <SummaryStat
          label={t("deceased")}
          value={summary.deceased}
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <SummaryStat
          label={t("analysis_adults")}
          value={summary.adults}
          icon={<UserRoundCheck className="h-5 w-5" />}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("analysis_demographics")}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            {[
              [t("male"), summary.male],
              [t("female"), summary.female],
              [t("gender_unspecified"), summary.unspecified_gender],
              [t("analysis_minors"), summary.minors],
              [t("analysis_unknown_age"), summary.unknown_age],
              [t("analysis_unknown_citizenship"), summary.unknown_citizenship],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-muted/60 p-3">
                <div className="font-bold">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("analysis_age_bands")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AnalysisBars items={summary.age_bands} label={(key) => ageLabels[key] ?? key} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("analysis_age_highlights")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("analysis_average_age")}</span>
              <strong>{summary.average_age ?? "—"}</strong>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("analysis_median_age")}</span>
              <strong>{summary.median_age ?? "—"}</strong>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t("analysis_average_lifespan")}</span>
              <strong>{summary.average_lifespan ?? "—"}</strong>
            </div>
            <div>
              <div className="text-muted-foreground">{t("analysis_oldest_recorded")}</div>
              <strong>{highlight(summary.oldest_member)}</strong>
            </div>
            <div>
              <div className="text-muted-foreground">{t("analysis_youngest_recorded")}</div>
              <strong>{highlight(summary.youngest_member)}</strong>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("analysis_births_by_decade")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AnalysisBars items={summary.birth_decades} label={(key) => key} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("analysis_deaths_by_decade")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AnalysisBars items={summary.death_decades} label={(key) => key} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
