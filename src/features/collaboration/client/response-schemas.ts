import { z } from "zod";

export const successResponseSchema = z.object({ ok: z.literal(true) }).passthrough();

export const ownershipTransferRequestResponseSchema = z
  .object({
    id: z.string(),
    status: z.literal("pending"),
    expires_at: z.string(),
  })
  .passthrough();

export const ownershipTransferResendResponseSchema = z
  .object({ verification_expires_at: z.string() })
  .passthrough();

export const contributorRemovalChallengeSchema = z
  .object({ id: z.string(), expires_at: z.string() })
  .strict();

export const treeMetadataResponseSchema = z
  .object({
    id: z.string(),
    name_en: z.string().nullable(),
    name_ar: z.string().nullable(),
    description_en: z.string().nullable(),
    description_ar: z.string().nullable(),
    country_code: z.string().nullable(),
    visibility: z.enum(["private", "public"]),
    created_at: z.string(),
    version: z.number().int().positive(),
  })
  .passthrough();

export const searchOptionSchema = z
  .object({
    id: z.string(),
    name_en: z.string().nullable(),
    name_ar: z.string().nullable(),
    birth_year: z.number().int().nullable().optional(),
    father_id: z.string().nullable().optional(),
    father_name_en: z.string().nullable().optional(),
    father_name_ar: z.string().nullable().optional(),
    grandfather_id: z.string().nullable().optional(),
    grandfather_name_en: z.string().nullable().optional(),
    grandfather_name_ar: z.string().nullable().optional(),
    great_grandfather_id: z.string().nullable().optional(),
    great_grandfather_name_en: z.string().nullable().optional(),
    great_grandfather_name_ar: z.string().nullable().optional(),
  })
  .passthrough();

export const invitationCreatedResponseSchema = z.object({ id: z.string() }).passthrough();
