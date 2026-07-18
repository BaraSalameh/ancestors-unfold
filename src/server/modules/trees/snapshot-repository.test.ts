import { describe, expect, it } from "vitest";
import { loadRenderableSnapshot } from "./snapshot-repository";

const now = "2026-07-18T00:00:00.000Z";

function runner() {
  return {
    async query<T extends Record<string, unknown>>(text: string) {
      let rows: Record<string, unknown>[] = [];
      if (text.includes("FROM app.family_members"))
        rows = [
          {
            id: "father",
            name_en: "Father",
            name_ar: "",
            gender: "male",
            notes: "private member note",
            created_at: now,
            updated_at: now,
          },
          {
            id: "mother",
            name_en: "Mother",
            name_ar: "",
            gender: "female",
            created_at: now,
            updated_at: now,
          },
          {
            id: "child",
            name_en: "Child",
            name_ar: "",
            gender: "female",
            father_id: "father",
            mother_id: "mother",
            subfamily_id: "branch",
            created_at: now,
            updated_at: now,
          },
        ];
      else if (text.includes("FROM app.subfamilies"))
        rows = [
          {
            id: "branch",
            name_en: "Branch",
            name_ar: "",
            linked_male_id: "father",
            notes: "private subfamily note",
            created_at: now,
            updated_at: now,
          },
        ];
      else if (text.includes("FROM app.unions"))
        rows = [
          { union_id: "union", status: "divorced", member_id: "father", display_order: 0 },
          { union_id: "union", status: "divorced", member_id: "mother", display_order: 1 },
        ];
      else if (text.includes("FROM app.external_children"))
        rows = [
          {
            id: "external",
            mother_id: "mother",
            name: "Private child",
            notes: "private external note",
          },
        ];
      return { rows: rows as T[], rowCount: rows.length };
    },
  };
}

describe("tree snapshot projection", () => {
  it("keeps render relationships while excluding private preview fields", async () => {
    const snapshot = await loadRenderableSnapshot(runner(), "tree", 7, false);
    const father = snapshot.members.find((member) => member.id === "father");
    const child = snapshot.members.find((member) => member.id === "child");

    expect(snapshot.version).toBe(7);
    expect(father).toMatchObject({ spouse_id: "mother", divorced_from: ["mother"] });
    expect(child).toMatchObject({ father_id: "father", mother_id: "mother" });
    expect(father).not.toHaveProperty("notes");
    expect(snapshot.members[1]).not.toHaveProperty("external_children");
    expect(snapshot.subfamilies[0]).not.toHaveProperty("notes");
  });

  it("retains private fields for authenticated snapshots", async () => {
    const snapshot = await loadRenderableSnapshot(runner(), "tree", 7, true);

    expect(snapshot.members[0].notes).toBe("private member note");
    expect(snapshot.members[1].external_children).toEqual([
      expect.objectContaining({ id: "external", notes: "private external note" }),
    ]);
    expect(snapshot.subfamilies[0].notes).toBe("private subfamily note");
  });
});
