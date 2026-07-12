import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, Languages, TreePine, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const location = useRouterState({ select: (state) => state.location });
  const isDashboard = location.pathname === "/";
  const isTreePreview = location.pathname.startsWith("/tree/") && location.search.mode === "preview";

  return (
    <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
          <TreePine className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">{t("app_name")}</span>
        </Link>

        {!isTreePreview && <nav className="ms-2 hidden items-center gap-1 md:flex">
          {!isDashboard && <Link to="/subfamilies" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" activeProps={{ className: "bg-accent text-accent-foreground" }}>
            {t("subfamilies_nav")}
          </Link>}
        </nav>}

        <div className="ms-auto flex items-center gap-1">
          {!isDashboard && !isTreePreview && <Button asChild size="sm" variant="default" className="hidden gap-1 sm:flex">
            <Link to="/add">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">{t("add_member")}</span>
            </Link>
          </Button>}
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
        </div>
      </div>
    </header>
  );
}
