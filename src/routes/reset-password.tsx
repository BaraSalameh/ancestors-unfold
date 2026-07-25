import { createFileRoute } from "@tanstack/react-router";
import { ResetPasswordPage } from "@/features/auth";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({ meta: [{ title: "Reset password | Ancestors Unfold" }] }),
  component: ResetPasswordPage,
});
