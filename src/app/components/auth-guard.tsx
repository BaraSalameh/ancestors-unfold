import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/features/auth";
import { useI18n } from "@/shared/i18n";
import { RoutePageSkeleton } from "@/shared/ui/page-skeletons";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, session } = useAuth();
  const { t, lang } = useI18n();
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const isAuthPage = location.pathname === "/auth";
  const isPasswordReset = location.pathname === "/reset-password";
  const isInvitation = location.pathname.startsWith("/invitation/");
  const isPublicPreview =
    location.pathname.startsWith("/tree/") && location.search.mode === "preview";
  const mayView =
    isAuthPage || isPasswordReset || isInvitation || isPublicPreview || isAuthenticated;

  useEffect(() => {
    if (isLoading || mayView) return;
    const destination = `${location.pathname}${location.href.includes("?") ? `?${location.href.split("?")[1]}` : ""}`;
    void navigate({
      to: "/auth",
      search: { redirect: destination, oauthError: undefined },
      replace: true,
    });
  }, [isLoading, mayView, location.pathname, location.href, navigate]);

  if (isLoading || !mayView) {
    return (
      <RoutePageSkeleton
        pathname={location.pathname}
        label={t("loading")}
        dashboardRole={session?.currentTree?.role}
        dashboardName={
          (lang === "ar"
            ? session?.currentTree?.nameAr || session?.currentTree?.nameEn
            : session?.currentTree?.nameEn || session?.currentTree?.nameAr) ?? undefined
        }
      />
    );
  }
  return children;
}
