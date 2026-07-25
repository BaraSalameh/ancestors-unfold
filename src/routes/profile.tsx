import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/features/account";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile | Ancestors Unfold" }] }),
  component: ProfilePage,
});
