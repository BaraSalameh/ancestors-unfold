import { z } from "zod";
import { COUNTRY_CODES } from "@/shared/domain/countries";

export const schemas = {
  register: z
    .object({
      email: z.string().trim().email().max(320),
      password: z.string().min(12).max(256),
      fullNameEn: z.string().trim().max(200),
      fullNameAr: z.string().trim().max(200),
      gender: z.enum(["male", "female"]),
      invitationToken: z.string().min(32).max(512).optional(),
    })
    .strict()
    .refine((value) => Boolean(value.fullNameEn || value.fullNameAr), {
      message: "At least one full name is required",
    })
    .transform((value) => ({
      ...value,
      fullNameEn: value.fullNameEn || value.fullNameAr,
      fullNameAr: value.fullNameAr || value.fullNameEn,
    })),
  login: z
    .object({ email: z.string().trim().email().max(320), password: z.string().min(12).max(256) })
    .strict(),
  emailCode: z
    .object({ email: z.string().trim().email().max(320), code: z.string().regex(/^\d{6}$/) })
    .strict(),
  resendCode: z.object({ email: z.string().trim().email().max(320) }).strict(),
  emailChangeRequest: z
    .object({
      email: z.string().trim().email().max(320),
      currentPassword: z.string().min(1).max(256),
    })
    .strict(),
  emailChangeConfirm: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
  profileNames: z
    .object({
      fullNameEn: z.string().trim().min(1).max(200),
      fullNameAr: z.string().trim().min(1).max(200),
      gender: z.enum(["male", "female"]).optional(),
    })
    .strict(),
  memberImageSign: z.object({ memberId: z.string().uuid().optional() }).strict(),
  memberImageRegister: z
    .object({
      assetId: z.string().min(1).max(255),
      publicId: z.string().min(1).max(255),
      secureUrl: z.string().url().max(2048),
      version: z.number().int().positive(),
      signature: z.string().regex(/^[a-f0-9]{40}$/i),
      memberId: z.string().uuid().optional(),
    })
    .strict(),
  memberImageDiscard: z.object({ assetId: z.string().min(1).max(255) }).strict(),
  deleteContributorAccountRequest: z.object({ confirmation: z.literal("DELETE") }).strict(),
  deleteContributorAccount: z
    .object({ confirmation: z.literal("DELETE"), code: z.string().regex(/^\d{6}$/) })
    .strict(),
  resetRequest: z.object({ email: z.string().trim().email().max(320) }).strict(),
  resetConfirm: z
    .object({ token: z.string().min(32).max(512), password: z.string().min(12).max(256) })
    .strict(),
  tree: z
    .object({
      name_en: z.string().trim().min(1).max(200),
      name_ar: z.string().trim().max(200).nullable().optional(),
      description_en: z.string().trim().max(5000).nullable().optional(),
      description_ar: z.string().trim().max(5000).nullable().optional(),
      country_code: z.enum(COUNTRY_CODES).nullable().optional(),
      visibility: z.enum(["private", "public"]).optional(),
      color: z.string().trim().max(100).optional(),
    })
    .strict(),
  branchGrant: z
    .object({
      userId: z.string().uuid(),
      rootSubfamilyId: z.string().uuid(),
      role: z.enum(["branch_editor", "branch_viewer"]),
      canReadContacts: z.boolean().default(false),
      canWriteContacts: z.boolean().default(false),
      expiresAt: z.string().datetime().nullable().optional(),
    })
    .strict()
    .refine((v) => !v.canWriteContacts || v.canReadContacts),
  invitation: z
    .object({
      email: z.string().trim().email().max(320),
      branchId: z.string().uuid(),
      existingFamilyMemberId: z.string().uuid(),
    })
    .strict(),
  branch: z
    .object({
      batchId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
      name_en: z.string().trim().min(1).max(200),
      name_ar: z.string().trim().max(200).optional(),
      rootFamilyMemberId: z.string().uuid(),
      status: z.literal("active").default("active"),
    })
    .strict(),
  branchUpdate: z
    .object({
      batchId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
      name_en: z.string().trim().min(1).max(200).optional(),
      name_ar: z.string().trim().max(200).nullable().optional(),
      rootFamilyMemberId: z.string().uuid().optional(),
      status: z.literal("active").optional(),
    })
    .strict()
    .refine(
      ({ batchId: _batchId, expectedVersion: _expectedVersion, ...changes }) =>
        Object.keys(changes).length > 0,
    )
    .refine((value) => value.status !== "active" || Boolean(value.rootFamilyMemberId), {
      path: ["rootFamilyMemberId"],
    }),
  branchDelete: z
    .object({
      batchId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  branchDeactivationRequest: z.object({ confirmation: z.literal("DELETE") }).strict(),
  branchDeactivationConfirm: z
    .object({
      confirmation: z.literal("DELETE"),
      code: z.string().regex(/^\d{6}$/),
      batchId: z.string().uuid(),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  branchAttachmentSign: z
    .object({
      fileName: z.string().trim().min(1).max(255),
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]),
      byteSize: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
      checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  branchAttachmentRegister: z
    .object({
      fileName: z.string().trim().min(1).max(255),
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]),
      byteSize: z
        .number()
        .int()
        .positive()
        .max(10 * 1024 * 1024),
      checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
      assetId: z.string().min(1).max(255),
      publicId: z.string().min(1).max(500),
      secureUrl: z.string().url().max(2000),
      version: z.number().int().positive(),
      signature: z.string().min(1).max(255),
      resourceType: z.enum(["image", "raw"]),
    })
    .strict(),
  branchAttachmentDiscard: z
    .object({
      assetId: z.string().min(1).max(255),
      publicId: z.string().min(1).max(500),
      version: z.number().int().positive(),
      signature: z.string().min(1).max(255),
      resourceType: z.enum(["image", "raw"]),
    })
    .strict(),
  transferRequest: z
    .object({
      proposedOwnerUserId: z.string().uuid(),
      reason: z.string().trim().max(1000).optional(),
    })
    .strict(),
  transferCode: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
  contributorRemovalCode: z.object({ code: z.string().regex(/^\d{6}$/) }).strict(),
  complaint: z
    .object({
      category: z.enum([
        "fake_tree",
        "impersonation",
        "incorrect_relationship",
        "privacy",
        "abusive_content",
        "spam",
        "other",
      ]),
      description: z.string().trim().min(10).max(5000),
    })
    .strict(),
  complaintReview: z
    .object({
      status: z.enum(["resolved", "dismissed"]),
      resolutionNote: z.string().trim().min(1).max(5000),
      serious: z.boolean().optional(),
    })
    .strict(),
  changeRequest: z
    .object({
      branchId: z.string().uuid(),
      memberId: z.string().uuid(),
      proposedChanges: z.record(z.string(), z.unknown()),
    })
    .strict(),
  scopedMember: z
    .object({
      memberId: z.string().uuid(),
      name_en: z.string().trim().max(200).optional(),
      name_ar: z.string().trim().max(200).optional(),
      notes: z.string().max(10_000).optional(),
      birth_date: z.string().date().nullable().optional(),
      death_date: z.string().date().nullable().optional(),
      is_deceased: z.boolean().optional(),
    })
    .strict()
    .refine((member) => member.death_date == null || member.is_deceased !== false, {
      message: "A member with a death date must be deceased",
    }),
  authenticityConfig: z
    .object({
      growingContributors: z.number().int().nonnegative(),
      growingBranches: z.number().int().nonnegative(),
      backedContributors: z.number().int().nonnegative(),
      backedBranches: z.number().int().nonnegative(),
      establishedContributors: z.number().int().nonnegative(),
      establishedBranches: z.number().int().nonnegative(),
      establishedMinDays: z.number().int().nonnegative(),
      recentActivityDays: z.number().int().positive(),
      seriousComplaintDowngrade: z.boolean(),
    })
    .strict(),
  contact: z
    .object({
      contactType: z.enum(["email", "phone", "address", "other"]),
      displayValue: z.string().trim().min(1).max(1000),
      normalizedValue: z.string().trim().max(1000).nullable().optional(),
      label: z.string().trim().max(100).nullable().optional(),
      address: z.record(z.string(), z.unknown()).nullable().optional(),
      isPrimary: z.boolean().default(false),
    })
    .strict(),
  snapshot: z
    .object({
      batchId: z.string().uuid().optional(),
      expectedVersion: z.number().int().positive(),
      members: z
        .array(
          z
            .object({
              id: z.string().min(1).max(200),
              name_en: z.string().trim().max(200),
              name_ar: z.string().trim().max(200),
              gender: z.enum(["male", "female"]),
              birth_date: z.string().max(50).optional(),
              death_date: z.string().max(50).optional(),
              is_deceased: z.boolean().optional(),
              citizen_status: z
                .enum(["resident", "non_resident"])
                .nullish()
                .transform((value) => value ?? "resident"),
              image_url: z
                .string()
                .trim()
                .url()
                .max(2048)
                .refine((value) => new URL(value).protocol === "https:")
                .optional(),
              image_public_id: z.string().min(1).max(255).optional(),
              image_asset_id: z.string().min(1).max(255).optional(),
              notes: z.string().max(10_000).optional(),
              father_id: z.string().max(200).optional(),
              mother_id: z.string().max(200).optional(),
              spouse_id: z.string().max(200).optional(),
              spouse_ids: z.array(z.string().max(200)).max(100).optional(),
              divorced_from: z.array(z.string().max(200)).max(100).optional(),
              is_unknown: z.boolean().optional(),
              external_children: z
                .array(
                  z
                    .object({
                      id: z.string().min(1).max(200),
                      name: z.string().trim().min(1).max(200),
                      other_parent_name: z.string().max(200).optional(),
                      birth_year: z
                        .string()
                        .regex(/^\d{1,4}$/)
                        .optional(),
                      notes: z.string().max(5000).optional(),
                    })
                    .strict(),
                )
                .max(500)
                .optional(),
              subfamily_id: z.string().max(200).optional(),
              pos_x: z.number().finite().optional(),
              pos_y: z.number().finite().optional(),
              decade_pos_x: z.number().finite().optional(),
              decade_pos_y: z.number().finite().optional(),
              created_at: z.string().max(50),
              updated_at: z.string().max(50),
            })
            .strict()
            .refine((member) => !!member.name_en || !!member.name_ar, {
              message: "At least one member name is required",
            })
            .refine((member) => !member.death_date || member.is_deceased !== false, {
              message: "A member with a death date must be deceased",
            }),
        )
        .max(10_000),
      subfamilies: z
        .array(
          z
            .object({
              id: z.string().min(1).max(200),
              name_en: z.string().trim().min(1).max(200),
              name_ar: z.string().trim().max(200),
              linked_male_id: z.string().max(200).optional(),
              parent_subfamily_id: z.string().max(200).optional(),
              status: z.enum(["active", "inactive"]).optional(),
              notes: z.string().max(10_000).optional(),
              attachments: z.array(z.unknown()).max(100).optional(),
              color: z.string().max(100).optional(),
              created_at: z.string().max(50),
              updated_at: z.string().max(50),
            })
            .strict(),
        )
        .max(2000),
    })
    .strict(),
};

export type SnapshotInput = z.infer<(typeof schemas)["snapshot"]>;

export const familyCsvPreviewSchema = z
  .object({
    csv: z
      .string()
      .min(1)
      .max(10 * 1024 * 1024),
  })
  .strict();

const sourceIdMappingSchema = z
  .object({ sourceId: z.string().min(1).max(200), targetId: z.string().uuid() })
  .strict();

export const familyCsvApplySchema = schemas.snapshot
  .extend({
    batchId: z.string().uuid(),
    sourceMemberIds: z.array(sourceIdMappingSchema).max(10_000),
    sourceBranchIds: z.array(sourceIdMappingSchema).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    const uuid = z.string().uuid();
    const check = (candidate: string | undefined, path: Array<string | number>) => {
      if (candidate && !uuid.safeParse(candidate).success)
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Expected UUID", path });
    };
    value.members.forEach((member, index) => {
      check(member.id, ["members", index, "id"]);
      check(member.father_id, ["members", index, "father_id"]);
      check(member.mother_id, ["members", index, "mother_id"]);
      check(member.spouse_id, ["members", index, "spouse_id"]);
      check(member.subfamily_id, ["members", index, "subfamily_id"]);
      member.spouse_ids?.forEach((id, spouseIndex) =>
        check(id, ["members", index, "spouse_ids", spouseIndex]),
      );
      member.divorced_from?.forEach((id, spouseIndex) =>
        check(id, ["members", index, "divorced_from", spouseIndex]),
      );
    });
    value.subfamilies.forEach((branch, index) => {
      check(branch.id, ["subfamilies", index, "id"]);
      check(branch.linked_male_id, ["subfamilies", index, "linked_male_id"]);
      check(branch.parent_subfamily_id, ["subfamilies", index, "parent_subfamily_id"]);
    });
    for (const [field, mappings] of [
      ["sourceMemberIds", value.sourceMemberIds],
      ["sourceBranchIds", value.sourceBranchIds],
    ] as const) {
      const sources = new Set<string>();
      const targets = new Set<string>();
      mappings.forEach((mapping, index) => {
        if (sources.has(mapping.sourceId) || targets.has(mapping.targetId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Import mappings must be one-to-one",
            path: [field, index],
          });
        sources.add(mapping.sourceId);
        targets.add(mapping.targetId);
      });
    }
  });
