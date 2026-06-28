import { createFileRoute } from "@tanstack/react-router";
import { FamilyTree } from "@/components/FamilyTree";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Family Tree Hub" },
      { name: "description", content: "Interactive bilingual family tree builder with full member management." },
      { property: "og:title", content: "Family Tree Hub" },
      { property: "og:description", content: "Visualize, build, and explore your family across generations." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <FamilyTree />
    </div>
  );
}
