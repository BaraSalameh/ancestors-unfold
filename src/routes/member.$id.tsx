import { createFileRoute } from "@tanstack/react-router";
import { MemberPage } from "@/features/members";

export const Route = createFileRoute("/member/$id")({
  head: () => ({ meta: [{ title: "Member Details — Family Tree Hub" }] }),
  component: MemberPage,
});
