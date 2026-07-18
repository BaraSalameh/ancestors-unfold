import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/pages/auth-page";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect:
      typeof s.redirect === "string" && s.redirect.startsWith("/") && !s.redirect.startsWith("//")
        ? s.redirect
        : "/",
    oauthError: typeof s.oauth_error === "string" ? s.oauth_error : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in | Ancestors Unfold" }] }),
  component: AuthRouteComponent,
});

function AuthRouteComponent() {
  return <AuthPage search={Route.useSearch()} />;
}
