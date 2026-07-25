import { createFileRoute } from "@tanstack/react-router";
import { InvitationPage } from "@/features/auth";

export const Route = createFileRoute("/invitation/$token")({
  head: () => ({ meta: [{ title: "Contributor invitation | Ancestors Unfold" }] }),
  component: InvitationPage,
});
