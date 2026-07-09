import { documentJsonScalarSchema } from "@ai-assistants/document-contracts/schemas";
import { z } from "zod";

export const jsonScalarSchema = documentJsonScalarSchema;

export const renderMetadataSchema = z
  .object({
    stage: z.literal("rendered"),
    renderedAt: z.string().min(1),
    templateArtifactId: z.string().uuid(),
    templateSha256: z.string().min(1),
    fieldValues: z.record(z.string().min(1), documentJsonScalarSchema),
    fieldKeys: z.array(z.string().min(1)),
    boldSignTextTags: z.array(
      z
        .object({
          raw: z.string().min(1),
          fieldType: z.string().min(1),
          signerIndex: z.number().int().positive().nullable(),
          isRequired: z.boolean(),
          fieldId: z.string().min(1).nullable(),
          definitionId: z.string().min(1).nullable(),
        })
        .strict(),
    ),
    sourceRefs: z.record(z.string(), z.unknown()),
  })
  .strict();
