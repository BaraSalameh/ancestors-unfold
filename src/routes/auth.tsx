import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/pages/auth-page";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => {
    const invitationToken =
      typeof s.invitationToken === "string"
        ? s.invitationToken
        : typeof s.invitation === "string"
          ? s.invitation
          : undefined;
    return {
      redirect:
        typeof s.redirect === "string" && s.redirect.startsWith("/") && !s.redirect.startsWith("//")
          ? s.redirect
          : "/",
      oauthError: typeof s.oauth_error === "string" ? s.oauth_error : undefined,
      ...(invitationToken ? { invitationToken } : {}),
    };
  },
  head: () => ({ meta: [{ title: "Sign in | Ancestors Unfold" }] }),
  component: AuthRouteComponent,
});

function AuthRouteComponent() {
  return <AuthPage search={Route.useSearch()} />;
}
