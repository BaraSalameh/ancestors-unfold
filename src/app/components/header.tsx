import { Link, useRouterState } from "@tanstack/react-router";
import { Moon, Sun, Languages, TreePine } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useAuth } from "@/features/auth";
import { familyStore, useFamilyPersistence } from "@/features/trees";
import { useTheme } from "@/app/providers/theme-context";
import { useI18n } from "@/shared/i18n";
import { isPublicPreviewRoute } from "@/app/domain/public-route";
import { HeaderAccountMenu } from "./header-account-menu";
import { HeaderTreeSave } from "./header-tree-save";
import { useTreeNavigationBlocker } from "./use-tree-navigation-blocker";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { user, isLoading, logout } = useAuth();
  const location = useRouterState({ select: (state) => state.location });
  const persistence = useFamilyPersistence();
  const isTreeEdit = location.pathname.startsWith("/tree/") && location.search.mode === "edit";
  const isTreePreview = isPublicPreviewRoute(location.pathname, location.search);
  const activeTreeId = location.pathname.match(/^\/tree\/([^/]+)/)?.[1];
  const isAuthPage = location.pathname === "/auth";
  const isTreeWorkspace =
    isTreeEdit ||
    /^\/(edit|member|add)\//.test(location.pathname) ||
    location.pathname === "/subfamilies";

  useTreeNavigationBlocker(isTreeWorkspace, persistence.dirty, t("unsaved_changes_warning"));

  return (
    <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
        <Link to="/" className="flex items-center gap-2 font-semibold text-foreground">
          <TreePine className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">{t("app_name")}</span>
        </Link>

        {!isTreePreview && !isAuthPage && (
          <nav className="ms-2 hidden items-center gap-1 md:flex">
            {isTreeEdit && (
              <Link
                to="/subfamilies"
                search={{ treeId: activeTreeId }}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                activeProps={{ className: "bg-accent text-accent-foreground" }}
              >
                {t("subfamilies_nav")}
              </Link>
            )}
          </nav>
        )}

        <div className="ms-auto flex items-center gap-1">
          {isTreeWorkspace && familyStore.canEditActiveTree() && (
            <HeaderTreeSave persistence={persistence} t={t} />
          )}
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
          <Button
            size="icon"
            variant="ghost"
            onClick={toggle}
            title={t("theme")}
            aria-label={t("theme")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {!isLoading && user ? (
            <HeaderAccountMenu user={user} lang={lang} logout={logout} t={t} />
          ) : !isLoading && isTreePreview ? (
            <Button asChild size="sm">
              <Link to="/auth" search={{ redirect: location.href, oauthError: undefined }}>
                {t("login")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
