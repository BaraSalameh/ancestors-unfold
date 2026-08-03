import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";
import { RoutePageSkeleton } from "@/shared/ui/page-skeletons";
import {
  currentTreeDisplayName,
  guardedRedirect,
  mayAccessRoute,
} from "@/app/domain/auth-guard-policy";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, session } = useAuth();
  const { t, lang } = useI18n();
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const profileComplete = session?.user.gender !== null;
  const mayView = mayAccessRoute(
    location.pathname,
    location.search,
    isAuthenticated,
    profileComplete,
  );

  useEffect(() => {
    if (isLoading || mayView) return;
    if (isAuthenticated && !profileComplete) {
      void navigate({ to: "/profile", replace: true });
      return;
    }
    const destination = guardedRedirect(location.pathname, location.href);
    void navigate({
      to: "/auth",
      search: { redirect: destination, oauthError: undefined },
      replace: true,
    });
  }, [
    isLoading,
    mayView,
    isAuthenticated,
    profileComplete,
    location.pathname,
    location.href,
    navigate,
  ]);

  if (isLoading || !mayView) {
    return (
      <RoutePageSkeleton
        pathname={location.pathname}
        label={t("loading")}
        dashboardRole={session?.currentTree?.role}
        dashboardName={currentTreeDisplayName(session?.currentTree, lang)}
      />
    );
  }
  return children;
}
