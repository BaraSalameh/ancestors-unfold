import { createFileRoute } from "@tanstack/react-router";
import { MemberPage, parseMemberNavigationSearch } from "@/features/members";

export const Route = createFileRoute("/member/$id")({
  validateSearch: parseMemberNavigationSearch,
  head: () => ({ meta: [{ title: "Member Details — Family Tree Hub" }] }),
  component: MemberPage,
});
