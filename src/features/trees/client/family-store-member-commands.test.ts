import { describe, expect, it, vi } from "vitest";
import { createMemberCommands, type MemberCommandContext } from "./family-store-member-commands";
import type { FamilyMember } from "@/features/members/domain";

const member = (id: string, patch: Partial<FamilyMember> = {}): FamilyMember => ({
  id,
  name_en: id,
  name_ar: id,
  gender: "male",
  citizen_status: "resident",
  created_at: "then",
  updated_at: "then",
  ...patch,
});

describe("atomic father and spouse creation", () => {
  it("creates ordered spouses and links the originating child in one commit", () => {
    let state = [
      member("mother", { gender: "female" }),
      member("child", { mother_id: "mother" }),
      member("existing", { gender: "female" }),
    ];
    const stagedImages = new Map<string, File>();
    const commit = vi.fn((mutator: () => void) => mutator());
    const context: MemberCommandContext = {
      get state() {
        return state;
      },
      set state(next) {
        state = next;
      },
      stagedImages,
      commit,
      replaceStagedImages: vi.fn(),
      emit: vi.fn(),
    };
    const commands = createMemberCommands(context);

    const father = commands.addFatherWithSpouses(
      { name_en: "Father", name_ar: "", gender: "male", citizen_status: "resident" },
      "child",
      [
        {
          key: "existing:mother",
          kind: "existing",
          memberId: "mother",
          locked: true,
          divorced: false,
        },
        {
          key: "new",
          kind: "new",
          input: {
            name_en: "New wife",
            name_ar: "",
            gender: "female",
            citizen_status: "resident",
          },
          divorced: true,
        },
        {
          key: "existing:existing",
          kind: "existing",
          memberId: "existing",
          divorced: false,
        },
      ],
    );

    expect(commit).toHaveBeenCalledTimes(1);
    expect(state.find(({ id }) => id === "child")?.father_id).toBe(father.id);
    expect(father.spouse_ids).toHaveLength(3);
    expect(father.spouse_ids?.[0]).toBe("mother");
    expect(father.divorced_from).toHaveLength(1);
    expect(state.find(({ id }) => id === "mother")?.spouse_id).toBe(father.id);
    expect(state.find(({ id }) => id === father.divorced_from?.[0])?.divorced_from).toContain(
      father.id,
    );
  });
});
