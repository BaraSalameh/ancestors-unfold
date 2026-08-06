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
            citizen_status: "non_resident",
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
    expect(state.find(({ name_en }) => name_en === "New wife")?.citizen_status).toBe(
      "non_resident",
    );
    expect(state.find(({ id }) => id === father.divorced_from?.[0])?.divorced_from).toContain(
      father.id,
    );
  });
});

describe("atomic member deletion", () => {
  it("removes multiple members and their relationships in one commit", () => {
    let state = [
      member("father", { spouse_id: "mother", spouse_ids: ["mother"] }),
      member("mother", { gender: "female", spouse_id: "father" }),
      member("child", { father_id: "father", mother_id: "mother" }),
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

    const result = createMemberCommands(context).removeMany(["father", "mother"]);

    expect(result).toEqual({ removed: 2, skipped: 0 });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(state).toEqual([member("child", { father_id: undefined, mother_id: undefined })]);
  });

  it("keeps protected members and reports them as skipped", () => {
    let state = [member("protected"), member("deletable")];
    const context: MemberCommandContext = {
      get state() {
        return state;
      },
      set state(next) {
        state = next;
      },
      stagedImages: new Map<string, File>(),
      commit: (mutator) => mutator(),
      replaceStagedImages: vi.fn(),
      emit: vi.fn(),
      protectedGender: (id) => (id === "protected" ? "male" : undefined),
    };

    expect(createMemberCommands(context).removeMany(["protected", "deletable"])).toEqual({
      removed: 1,
      skipped: 1,
    });
    expect(state.map(({ id }) => id)).toEqual(["protected"]);
  });
});
