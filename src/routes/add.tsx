import { createFileRoute } from "@tanstack/react-router";
import { AddPage, addMemberSearchSchema } from "@/features/members";

export const Route = createFileRoute("/add")({
  validateSearch: addMemberSearchSchema,
  head: () => ({ meta: [{ title: "Add Member — Family Tree Hub" }] }),
  component: AddPage,
});
