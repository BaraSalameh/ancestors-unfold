import { describe, expect, it } from "vitest";
import type { FamilyCsvPreviewResponse } from "../api/tree-client";
import { buildFamilyCsvDraft } from "./family-csv-draft";

const preview: FamilyCsvPreviewResponse = {
  expectedVersion: 4,
  summary: { members: 2, parentLinks: 0, spouseLinks: 1, branches: 1 },
  warnings: [],
  members: [
    {
      id: "00000000-0000-4000-8000-000000000100",
      name_en: "Imported owner",
      name_ar: "",
      gender: "male",
      citizen_status: "resident",
      spouse_id: "00000000-0000-4000-8000-000000000101",
      spouse_ids: ["00000000-0000-4000-8000-000000000101"],
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000101",
      name_en: "Wife",
      name_ar: "",
      gender: "female",
      citizen_status: "resident",
      spouse_id: "00000000-0000-4000-8000-000000000100",
      spouse_ids: ["00000000-0000-4000-8000-000000000100"],
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  subfamilies: [
    {
      id: "00000000-0000-4000-8000-000000000102",
      name_en: "Imported branch",
      name_ar: "",
      linked_male_id: "00000000-0000-4000-8000-000000000100",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  sourceMemberIds: [
    { sourceId: "source-owner", targetId: "00000000-0000-4000-8000-000000000100" },
    { sourceId: "source-wife", targetId: "00000000-0000-4000-8000-000000000101" },
  ],
  sourceBranchIds: [
    { sourceId: "source-branch", targetId: "00000000-0000-4000-8000-000000000102" },
  ],
  mappingRequirements: {
    linkedMembers: [],
    grantedBranches: [],
  },
};

// The scenarios share one complete preview fixture and verify append and explicit mapping together.
// eslint-disable-next-line max-lines-per-function
describe("family CSV draft append", () => {
  it("keeps the current tree and appends the imported family without connecting them", () => {
    const draft = buildFamilyCsvDraft(
      preview,
      {
        linkedMembers: {
          "00000000-0000-4000-8000-000000000001": "00000000-0000-4000-8000-000000000100",
        },
        grantedBranches: {
          "00000000-0000-4000-8000-000000000002": "00000000-0000-4000-8000-000000000102",
        },
      },
      [
        {
          id: "00000000-0000-4000-8000-000000000001",
          name_en: "Current owner",
          name_ar: "",
          gender: "male",
          citizen_status: "resident",
          image_url: "https://example.com/owner.jpg",
          image_asset_id: "asset",
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      ],
      [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name_en: "Current branch",
          name_ar: "",
          attachments: [
            {
              id: "attachment",
              name: "Document",
              type: "pdf",
              url: "https://example.com/a",
              created_at: "2020-01-01",
            },
          ],
          created_at: "2020-01-01T00:00:00.000Z",
          updated_at: "2020-01-01T00:00:00.000Z",
        },
      ],
    );

    expect(draft.members).toHaveLength(3);
    expect(draft.members[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      image_asset_id: "asset",
    });
    expect(draft.members[0]).not.toHaveProperty("spouse_id");
    expect(draft.members[1]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000100",
      spouse_id: "00000000-0000-4000-8000-000000000101",
    });
    expect(draft.subfamilies).toHaveLength(2);
    expect(draft.subfamilies[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000002",
    });
    expect(draft.subfamilies[0].attachments).toHaveLength(1);
    expect(draft.subfamilies[1]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000102",
      linked_male_id: "00000000-0000-4000-8000-000000000100",
    });
    expect(draft.sourceMemberIds.get("00000000-0000-4000-8000-000000000001")).toBe(
      "existing|member|00000000-0000-4000-8000-000000000001",
    );
    expect(draft.sourceMemberIds.get("00000000-0000-4000-8000-000000000100")).toBe("source-owner");
    expect(draft.sourceBranchIds.get("00000000-0000-4000-8000-000000000002")).toBe(
      "existing|branch|00000000-0000-4000-8000-000000000002",
    );
    expect(draft.protectedMemberIds.size).toBe(0);
    expect(draft.protectedBranchIds.size).toBe(0);
  });

  it("rejects an imported UUID that collides with the current tree", () => {
    expect(() =>
      buildFamilyCsvDraft(
        { ...preview, members: [{ ...preview.members[0], id: "collision" }] },
        { linkedMembers: {}, grantedBranches: {} },
        [{ ...preview.members[1], id: "collision" }],
        [],
      ),
    ).toThrow("INVALID_MEMBER_MAPPING");
  });

  it("optionally maps imported records onto protected existing IDs", () => {
    const existingMember = {
      ...preview.members[0],
      id: "00000000-0000-4000-8000-000000000001",
      name_en: "Linked owner",
      image_asset_id: "existing-asset",
      created_at: "2020-01-01T00:00:00.000Z",
    };
    const existingBranch = {
      ...preview.subfamilies[0],
      id: "00000000-0000-4000-8000-000000000002",
      name_en: "Granted branch",
      attachments: [],
      created_at: "2020-01-01T00:00:00.000Z",
    };
    const mappedPreview: FamilyCsvPreviewResponse = {
      ...preview,
      subfamilies: [{ ...preview.subfamilies[0], name_en: existingBranch.name_en }],
      mappingRequirements: {
        linkedMembers: [
          {
            target_member_id: existingMember.id,
            name_en: existingMember.name_en,
            name_ar: null,
            gender: "male",
            role: "owner",
          },
        ],
        grantedBranches: [
          {
            target_branch_id: existingBranch.id,
            name_en: existingBranch.name_en,
            name_ar: null,
          },
        ],
      },
    };

    const draft = buildFamilyCsvDraft(
      mappedPreview,
      {
        linkedMembers: { [existingMember.id]: preview.members[0].id },
        grantedBranches: { [existingBranch.id]: preview.subfamilies[0].id },
      },
      [existingMember],
      [existingBranch],
    );

    expect(draft.members).toHaveLength(2);
    expect(draft.members[0]).toMatchObject({
      id: existingMember.id,
      name_en: "Imported owner",
      image_asset_id: "existing-asset",
      spouse_id: preview.members[1].id,
    });
    expect(draft.subfamilies).toHaveLength(1);
    expect(draft.subfamilies[0]).toMatchObject({
      id: existingBranch.id,
      linked_male_id: existingMember.id,
    });
    expect(draft.sourceMemberIds.get(existingMember.id)).toBe("source-owner");
    expect(draft.sourceBranchIds.get(existingBranch.id)).toBe("source-branch");
    expect(draft.protectedMemberIds.get(existingMember.id)).toBe("male");
    expect(draft.protectedBranchIds.has(existingBranch.id)).toBe(true);
  });

  it("rejects an existing-tree branch conflict when it is not explicitly mapped", () => {
    const existingBranch = {
      ...preview.subfamilies[0],
      id: "00000000-0000-4000-8000-000000000002",
      attachments: [],
    };

    expect(() =>
      buildFamilyCsvDraft(
        {
          ...preview,
          subfamilies: [{ ...preview.subfamilies[0], name_en: existingBranch.name_en }],
        },
        { linkedMembers: {}, grantedBranches: {} },
        [],
        [existingBranch],
      ),
    ).toThrow("DUPLICATE_BRANCH_NAME");
  });
});
