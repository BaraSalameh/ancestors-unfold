import { createFileRoute } from "@tanstack/react-router";
import { EditPage } from "@/features/members";

export const Route = createFileRoute("/edit/$id")({
  head: () => ({ meta: [{ title: "Edit Member — Family Tree Hub" }] }),
  component: EditPage,
});
