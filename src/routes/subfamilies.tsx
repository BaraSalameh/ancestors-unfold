import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SubfamilyPanel } from "@/components/FamilyTree";
import { useState } from "react";

export const Route = createFileRoute("/subfamilies")({
  component: SubfamiliesPage,
});

function SubfamiliesPage() {
  const [selectedSubfamilyId, setSelectedSubfamilyId] = useState<string | null>(null);
  const [filterEnabled, setFilterEnabled] = useState(false);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sub-families</h1>
          <p className="text-sm text-muted-foreground">
            Create a label first, then connect it to a male branch and manage attachments.
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tree
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <SubfamilyPanel
          mode="manage"
          selectedSubfamilyId={selectedSubfamilyId}
          onSelectSubfamily={setSelectedSubfamilyId}
          filterEnabled={filterEnabled}
          onToggleFilter={setFilterEnabled}
        />
      </div>
    </div>
  );
}
