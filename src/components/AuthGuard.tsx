import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const isAuthPage = location.pathname === "/auth";
  const isPublicPreview = location.pathname.startsWith("/tree/") && location.search.mode === "preview";
  const mayView = isAuthPage || isPublicPreview || isAuthenticated;

  useEffect(() => {
    if (isLoading || mayView) return;
    const destination = `${location.pathname}${location.href.includes("?") ? `?${location.href.split("?")[1]}` : ""}`;
    void navigate({ to: "/auth", search: { redirect: destination }, replace: true });
  }, [isLoading, mayView, location.pathname, location.href, navigate]);

  if (isLoading || !mayView) {
    return <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center"><LoaderCircle className="h-7 w-7 animate-spin text-primary" aria-label="Loading session" /></div>;
  }
  return children;
}

