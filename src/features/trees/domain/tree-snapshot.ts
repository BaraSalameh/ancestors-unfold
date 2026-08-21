import { z } from "zod";

const dateStringSchema = z.string().max(50);

const snapshotMemberSchema = z
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
    created_at: dateStringSchema,
    updated_at: dateStringSchema,
  })
  .strict()
  .refine((member) => Boolean(member.name_en || member.name_ar), {
    message: "At least one member name is required",
  })
  .refine((member) => !member.death_date || member.is_deceased !== false, {
    message: "A member with a death date must be deceased",
  });

const branchAttachmentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    url: z.string(),
    created_at: dateStringSchema,
  })
  .strict();

const snapshotSubfamilySchema = z
  .object({
    id: z.string().min(1).max(200),
    name_en: z.string().trim().min(1).max(200),
    name_ar: z.string().trim().max(200),
    linked_male_id: z.string().max(200).optional(),
    parent_subfamily_id: z.string().max(200).optional(),
    status: z.enum(["active", "inactive"]).optional(),
    notes: z.string().max(10_000).optional(),
    attachments: z.array(branchAttachmentSchema).max(100).optional(),
    created_at: dateStringSchema,
    updated_at: dateStringSchema,
  })
  .strict();

export const treeSnapshotPayloadSchema = z
  .object({
    members: z.array(snapshotMemberSchema).max(10_000),
    subfamilies: z.array(snapshotSubfamilySchema).max(2_000),
  })
  .strict();

export const treeSnapshotSchema = treeSnapshotPayloadSchema
  .extend({
    version: z.number().int().positive(),
    access_scope: z.enum(["tree", "branch", "preview"]),
    assigned_branch_id: z.string().optional(),
    capabilities: z.object({ can_import_csv: z.boolean() }).strict(),
  })
  .strict();

export type TreeSnapshot = z.infer<typeof treeSnapshotSchema>;
