import { Link } from "@tanstack/react-router";
import { Moon, Sun, Languages, TreePine, Settings as SettingsIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
          <TreePine className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">{t("app_name")}</span>
        </Link>

        <nav className="ms-2 hidden items-center gap-1 md:flex">
          <Link to="/" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" activeProps={{ className: "bg-accent text-accent-foreground" }} activeOptions={{ exact: true }}>
            {t("family_tree")}
          </Link>
          <Link to="/settings" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" activeProps={{ className: "bg-accent text-accent-foreground" }}>
            {t("settings")}
          </Link>
        </nav>

        <div className="ms-auto flex items-center gap-1">
          <Button asChild size="sm" variant="default" className="gap-1">
            <Link to="/add">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("add_member")}</span>
            </Link>
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            title={t("language")}
            aria-label={t("language")}
          >
            <Languages className="h-4 w-4" />
            <span className="sr-only">{lang.toUpperCase()}</span>
          </Button>
          <Button size="icon" variant="ghost" onClick={toggle} title={t("theme")} aria-label={t("theme")}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button asChild size="icon" variant="ghost" className="md:hidden" aria-label={t("settings")}>
            <Link to="/settings">
              <SettingsIcon className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
