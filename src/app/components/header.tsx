import { Link, useBlocker, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Moon,
  Sun,
  Languages,
  TreePine,
  LogOut,
  UserRound,
  Settings,
  LoaderCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { useAuth } from "@/features/auth";
import { accountDisplayName } from "@/features/account";
import { familyStore, isTreeEditorDestination, useFamilyPersistence } from "@/features/trees";
import { useTheme } from "@/app/providers/theme-provider";
import { useI18n } from "@/shared/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";

export function Header() {
  const { t, lang, setLang } = useI18n();
  const { theme, toggle } = useTheme();
  const { user, isLoading, logout } = useAuth();
  const location = useRouterState({ select: (state) => state.location });
  const persistence = useFamilyPersistence();
  const isTreeEdit = location.pathname.startsWith("/tree/") && location.search.mode === "edit";
  const isTreePreview =
    location.pathname.startsWith("/tree/") && location.search.mode === "preview";
  const activeTreeId = location.pathname.match(/^\/tree\/([^/]+)/)?.[1];
  const isAuthPage = location.pathname === "/auth";
  const isTreeWorkspace =
    isTreeEdit ||
    /^\/(edit|member|add)\//.test(location.pathname) ||
    location.pathname === "/subfamilies";

  useBlocker({
    shouldBlockFn: ({ next }) => {
      if (!isTreeWorkspace || !persistence.dirty) return false;
      const nextSearch = next.search as { mode?: string };
      const nextIsWorkspace = isTreeEditorDestination(
        next.pathname,
        nextSearch,
        familyStore.getActiveTreeId(),
      );
      if (nextIsWorkspace) return false;
      const discard = window.confirm(t("unsaved_changes_warning"));
      if (discard) familyStore.discardDraft();
      return !discard;
    },
    enableBeforeUnload: isTreeWorkspace && persistence.dirty,
  });

  const updateTree = async () => {
    if (persistence.conflicted) {
      if (window.confirm(t("reload_latest_warning"))) familyStore.reloadAfterConflict();
      return;
    }
    try {
      await familyStore.updateSnapshot();
      toast.success(t("tree_saved"));
    } catch {
      const conflicted = familyStore.getPersistenceState().conflicted;
      toast.error(conflicted ? t("tree_version_conflict") : t("tree_update_failed_draft"));
    }
  };

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
            <Button
              size="sm"
              variant={persistence.dirty ? "default" : "secondary"}
              disabled={!persistence.dirty || persistence.saving}
              onClick={() => void updateTree()}
              aria-live="polite"
            >
              {persistence.saving && <LoaderCircle className="me-2 h-4 w-4 animate-spin" />}
              {persistence.saving
                ? t("updating_tree")
                : persistence.conflicted
                  ? t("reload_latest")
                  : persistence.error
                    ? t("retry_update")
                    : persistence.dirty
                      ? t("update")
                      : t("saved")}
            </Button>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" aria-label={t("user_profile")}>
                  <UserRound className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-64">
                <DropdownMenuLabel>
                  <span className="block truncate">{accountDisplayName(user, lang)}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <Settings className="h-4 w-4" />
                    {t("profile_settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/activity">
                    <Activity className="h-4 w-4" />
                    {t("activity_history")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    void logout().then(() => {
                      window.location.assign("/auth");
                    })
                  }
                  className="text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
