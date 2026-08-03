import { z } from "zod";

const missingField = z.enum(["name_en", "name_ar", "birth_date", "branch", "image", "parent"]);

const analysisFiltersSchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    genders: z
      .array(z.enum(["male", "female"]))
      .max(2)
      .optional(),
    lifeStatus: z.enum(["living", "deceased"]).optional(),
    citizenStatuses: z
      .array(z.enum(["resident", "non_resident"]))
      .max(2)
      .optional(),
    branchIds: z.array(z.string().uuid()).max(20).optional(),
    minAge: z.number().int().min(0).max(200).optional(),
    maxAge: z.number().int().min(0).max(200).optional(),
    birthFrom: z.string().date().optional(),
    birthTo: z.string().date().optional(),
    deathFrom: z.string().date().optional(),
    deathTo: z.string().date().optional(),
    createdFrom: z.string().datetime().optional(),
    createdTo: z.string().datetime().optional(),
    updatedFrom: z.string().datetime().optional(),
    updatedTo: z.string().datetime().optional(),
    parentCount: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
    excludeWives: z.boolean().optional(),
    hasSpouse: z.boolean().optional(),
    hasChildren: z.boolean().optional(),
    minChildren: z.number().int().min(0).max(1000).optional(),
    maxChildren: z.number().int().min(0).max(1000).optional(),
    minGeneration: z.number().int().min(0).max(100).optional(),
    maxGeneration: z.number().int().min(0).max(100).optional(),
    missingFields: z.array(missingField).max(7).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.minAge === undefined || value.maxAge === undefined || value.minAge <= value.maxAge,
  )
  .refine(
    (value) =>
      value.minChildren === undefined ||
      value.maxChildren === undefined ||
      value.minChildren <= value.maxChildren,
  )
  .refine(
    (value) =>
      value.minGeneration === undefined ||
      value.maxGeneration === undefined ||
      value.minGeneration <= value.maxGeneration,
  );

const analysisQueryDefinitionSchema = z
  .object({
    filters: analysisFiltersSchema,
    sort: z.enum([
      "name",
      "age",
      "birth_date",
      "death_date",
      "children",
      "generation",
      "created_at",
      "updated_at",
    ]),
    direction: z.enum(["asc", "desc"]),
    view: z.enum(["overview", "branches", "relationships", "quality", "explorer"]).optional(),
  })
  .strict();

export const memberPageSchema = analysisQueryDefinitionSchema.extend({
  cursor: z.string().max(500).nullable().optional(),
  limit: z.number().int().min(1).max(100),
});

export const analysisReportSchema = z
  .object({
    report: z.enum(["branches", "relationships", "quality"]),
  })
  .strict();

export const analysisExportSchema = analysisQueryDefinitionSchema.extend({
  format: z.enum(["csv", "json"]),
});

export const savedViewCreateSchema = z
  .object({ name: z.string().trim().min(1).max(120), definition: analysisQueryDefinitionSchema })
  .strict();

export const savedViewUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    definition: analysisQueryDefinitionSchema.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.definition !== undefined);

export type MemberPageInput = z.infer<typeof memberPageSchema>;
export type AnalysisExportInput = z.infer<typeof analysisExportSchema>;
