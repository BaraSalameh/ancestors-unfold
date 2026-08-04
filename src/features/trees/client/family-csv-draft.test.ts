import { describe, expect, it } from "vitest";
import type { FamilyCsvPreviewResponse } from "../api/tree-client";
import { buildFamilyCsvDraft } from "./family-csv-draft";

const preview: FamilyCsvPreviewResponse = {
  expectedVersion: 4,
  summary: { members: 2, parentLinks: 0, spouseLinks: 1, branches: 1 },
  warnings: [],
  members: [
    {
      id: "source-owner",
      name_en: "Imported owner",
      name_ar: "",
      gender: "male",
      citizen_status: "resident",
      spouse_id: "source-wife",
      spouse_ids: ["source-wife"],
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "source-wife",
      name_en: "Wife",
      name_ar: "",
      gender: "female",
      citizen_status: "resident",
      spouse_id: "source-owner",
      spouse_ids: ["source-owner"],
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  subfamilies: [
    {
      id: "source-branch",
      name_en: "Imported branch",
      name_ar: "",
      linked_male_id: "source-owner",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ],
  mappingRequirements: {
    linkedMembers: [
      {
        target_member_id: "00000000-0000-4000-8000-000000000001",
        name_en: "Current owner",
        name_ar: "",
        gender: "male",
        role: "owner",
      },
    ],
    grantedBranches: [
      {
        target_branch_id: "00000000-0000-4000-8000-000000000002",
        name_en: "Current branch",
        name_ar: "",
      },
    ],
  },
};

describe("family CSV draft mapping", () => {
  it("reuses protected IDs and images while remapping every relationship", () => {
    let sequence = 10;
    const draft = buildFamilyCsvDraft(
      preview,
      {
        linkedMembers: {
          "00000000-0000-4000-8000-000000000001": "source-owner",
        },
        grantedBranches: {
          "00000000-0000-4000-8000-000000000002": "source-branch",
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
      () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
    );

    expect(draft.members[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      image_asset_id: "asset",
      spouse_id: "00000000-0000-4000-8000-000000000010",
    });
    expect(draft.subfamilies[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000002",
      linked_male_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(draft.subfamilies[0].attachments).toHaveLength(1);
    expect(draft.sourceMemberIds.get("00000000-0000-4000-8000-000000000001")).toBe("source-owner");
  });

  it("rejects duplicate or gender-incompatible protected mappings", () => {
    expect(() =>
      buildFamilyCsvDraft(
        preview,
        {
          linkedMembers: {
            "00000000-0000-4000-8000-000000000001": "source-wife",
          },
          grantedBranches: {
            "00000000-0000-4000-8000-000000000002": "source-branch",
          },
        },
        [],
        [],
      ),
    ).toThrow("INVALID_MEMBER_MAPPING");
  });
});
