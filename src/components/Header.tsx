import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, Languages, TreePine, Plus, LogOut, UserRound, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { user, isLoading, logout } = useAuth();
  const location = useRouterState({ select: (state) => state.location });
  const isDashboard = location.pathname === "/";
  const isTreePreview = location.pathname.startsWith("/tree/") && location.search.mode === "preview";
  const isAuthPage = location.pathname === "/auth";

  return (
    <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
          <TreePine className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">{t("app_name")}</span>
        </Link>

        {!isTreePreview && !isAuthPage && <nav className="ms-2 hidden items-center gap-1 md:flex">
          {!isDashboard && <Link to="/subfamilies" className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" activeProps={{ className: "bg-accent text-accent-foreground" }}>
            {t("subfamilies_nav")}
          </Link>}
        </nav>}

        <div className="ms-auto flex items-center gap-1">
          {!isDashboard && !isTreePreview && !isAuthPage && <Button asChild size="sm" variant="default" className="hidden gap-1 sm:flex">
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
          {!isLoading && user ? <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t("user_profile")}><UserRound className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-64">
              <DropdownMenuLabel><span className="block truncate">{(lang === "ar" ? user.fullNameAr : user.fullNameEn) || user.email}</span><span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span></DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><Link to="/profile"><Settings className="h-4 w-4" />{t("profile_settings")}</Link></DropdownMenuItem>
              <DropdownMenuItem onClick={() => void logout().then(() => { window.location.assign("/auth"); })} className="text-destructive"><LogOut className="h-4 w-4" />{t("logout")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> : !isLoading && isTreePreview ? <Button asChild size="sm"><Link to="/auth" search={{ redirect: location.href }}>{t("login")}</Link></Button> : null}
        </div>
      </div>
    </header>
  );
}
