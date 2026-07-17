import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { familyStore } from "@/lib/family-store";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Family Tree Hub" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{t("settings")}</h1>

      <div className="space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <Label>{t("language")}</Label>
          <Select value={lang} onValueChange={(v) => setLang(v as "en" | "ar")}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t("english")}</SelectItem>
              <SelectItem value="ar">{t("arabic")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("theme")}</Label>
          <Select value={theme} onValueChange={(v) => setTheme(v as "light" | "dark")}>
            <SelectTrigger className="w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("light")}</SelectItem>
              <SelectItem value="dark">{t("dark")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="border-t pt-4">
          <Button
            variant="outline"
            onClick={() => {
              familyStore.reset();
              toast.success(t("data_reset"));
            }}
          >
            {t("reset_data")}
          </Button>
        </div>
      </div>
    </div>
  );
}
