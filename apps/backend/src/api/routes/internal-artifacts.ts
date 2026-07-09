import { createHash } from "node:crypto";
import {
  toolError,
  toolData,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { Hono } from "hono";
import { z } from "zod";
import { requireAssistantProfile } from "../../auth/assistant-resolution";
import {
  prepareProfileArtifactDeliveryBytes,
  saveProfileArtifactBytes,
} from "../../product/artifacts/artifact-service";
import {
  getProfileArtifactMetadata,
  listProfileArtifactMetadata,
  searchProfileArtifactMetadata,
} from "../../product/artifacts/artifact-metadata";
import { parseJsonBody } from "../../shared/http-validation";
import { controlDb } from "../control-db";
import { requireMachine } from "../http-auth";

const MAX_ARTIFACT_SAVE_BYTES = 20_000_000;
const MAX_ARTIFACT_DELIVERY_BYTES = 20_000_000;

const artifactToolOriginSchema = z
  .object({
    messageChannel: z.string().trim().min(1).nullable().optional(),
    sessionKey: z.string().trim().min(1).nullable().optional(),
    sessionId: z.string().trim().min(1).nullable().optional(),
    deliveryContext: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict()
  .optional();

const autoSaveInboundMediaRequestSchema = z
  .object({
    agentId: z.string().trim().min(1),
    filename: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1000).nullable().optional(),
    mimeType: z.string().trim().min(1),
    contentBase64: z.string().trim().min(1),
    byteSize: z.number().int().positive().max(MAX_ARTIFACT_SAVE_BYTES),
    sha256: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(1).max(500),
    metadata: z.record(z.string(), z.unknown()).default({}),
    origin: artifactToolOriginSchema,
  })
  .strict();

const currentThreadAttachmentRequestSchema = z
  .object({
    agentId: z.string().trim().min(1),
    toolCallId: z.string().trim().min(1),
    artifactId: z.string().trim().uuid(),
    expectedSha256: z.string().trim().min(1).optional(),
    filename: z.string().trim().min(1).max(200).optional(),
    origin: artifactToolOriginSchema,
  })
  .strict();

const artifactListRequestSchema = z
  .object({
    agentId: z.string().trim().min(1),
    limit: z.number().int().min(1).max(50),
    origin: artifactToolOriginSchema,
  })
  .strict();

const artifactGetRequestSchema = z
  .object({
    agentId: z.string().trim().min(1),
    artifactId: z.string().trim().uuid(),
    origin: artifactToolOriginSchema,
  })
  .strict();

const artifactSearchRequestSchema = z
  .object({
    agentId: z.string().trim().min(1),
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(50),
    origin: artifactToolOriginSchema,
  })
  .strict();

function toolErrorFromDomainError(error: DomainError) {
  return toolError({
    message: error.message,
    ...(error.details === undefined ? {} : { details: { cause: error.details } }),
  });
}

async function withArtifactToolResult(work: () => Promise<BackendToolResult>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) return toolErrorFromDomainError(error);
    throw error;
  }
}

function decodeBase64Artifact(input: {
  contentBase64: string;
  byteSize: number;
  sha256?: string | undefined;
}): Uint8Array {
  const bytes = Buffer.from(input.contentBase64, "base64");
  if (bytes.byteLength !== input.byteSize) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Decoded artifact size ${bytes.byteLength} does not match declared byteSize ${input.byteSize}.`,
    );
  }
  if (input.sha256) {
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== input.sha256) {
      throw new DomainError(
        domainCodes.CONFLICT,
        "Decoded artifact bytes do not match declared SHA-256.",
      );
    }
  }
  return bytes;
}

function originChannel(input: z.infer<typeof artifactToolOriginSchema>): string {
  const deliveryContext = input?.deliveryContext;
  const channel =
    deliveryContext && typeof deliveryContext.channel === "string"
      ? deliveryContext.channel.trim()
      : "";
  return channel || input?.messageChannel || "current_thread";
}

export function registerInternalArtifactRoutes(app: Hono) {
  app.post("/internal/ai-assistants/artifacts/list", async (c) => {
    requireMachine(c);
    const result = await withArtifactToolResult(async () => {
      const body = await parseJsonBody(c, artifactListRequestSchema, "Artifact list payload");
      const db = controlDb();
      const { profile } = await requireAssistantProfile(db, body.agentId);
      return toolData({
        artifacts: await listProfileArtifactMetadata(db, profile.id, body.limit),
      });
    });
    return c.json(result);
  });

  app.post("/internal/ai-assistants/artifacts/get", async (c) => {
    requireMachine(c);
    const result = await withArtifactToolResult(async () => {
      const body = await parseJsonBody(c, artifactGetRequestSchema, "Artifact get payload");
      const db = controlDb();
      const { profile } = await requireAssistantProfile(db, body.agentId);
      return toolData({
        artifact: await getProfileArtifactMetadata(db, profile.id, body.artifactId),
      });
    });
    return c.json(result);
  });

  app.post("/internal/ai-assistants/artifacts/search", async (c) => {
    requireMachine(c);
    const result = await withArtifactToolResult(async () => {
      const body = await parseJsonBody(c, artifactSearchRequestSchema, "Artifact search payload");
      const db = controlDb();
      const { profile } = await requireAssistantProfile(db, body.agentId);
      return toolData({
        query: body.query,
        artifacts: await searchProfileArtifactMetadata(db, profile.id, body.query, body.limit),
      });
    });
    return c.json(result);
  });

  app.post("/internal/ai-assistants/artifacts/auto-save-inbound-media", async (c) => {
    requireMachine(c);
    const result = await withArtifactToolResult(async () => {
      const body = await parseJsonBody(
        c,
        autoSaveInboundMediaRequestSchema,
        "Auto-save inbound media payload",
      );
      const db = controlDb();
      const { profile } = await requireAssistantProfile(db, body.agentId);
      const bytes = decodeBase64Artifact(body);
      const saved = await saveProfileArtifactBytes(db, {
        profileId: profile.id,
        filename: body.filename,
        description: body.description ?? null,
        artifactType: "inbound.media",
        mimeType: body.mimeType,
        bytes,
        expectedSha256: body.sha256,
        idempotencyKey: body.idempotencyKey,
        metadata: {
          ...body.metadata,
          intake: "auto_saved_chat_attachment",
          origin: body.origin ?? null,
        },
      });
      return toolData({
        profileFileId: saved.artifact.id,
        artifactId: saved.artifact.id,
        filename: saved.artifact.filename,
        mimeType: saved.artifact.mime_type,
        byteSize: saved.byteSize,
        sha256: saved.sha256,
        description: saved.artifact.description,
        createdAt: saved.artifact.created_at,
      });
    });
    return c.json(result);
  });

  app.post("/internal/ai-assistants/artifacts/current-thread-attachment", async (c) => {
    requireMachine(c);
    const result = await withArtifactToolResult(async () => {
      const body = await parseJsonBody(
        c,
        currentThreadAttachmentRequestSchema,
        "Current-thread artifact delivery payload",
      );
      const db = controlDb();
      const { profile } = await requireAssistantProfile(db, body.agentId);
      const delivery = await prepareProfileArtifactDeliveryBytes(db, {
        profileId: profile.id,
        artifactId: body.artifactId,
        expectedSha256: body.expectedSha256 ?? null,
        filename: body.filename ?? null,
      });
      if (delivery.bytes.byteLength > MAX_ARTIFACT_DELIVERY_BYTES) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `Artifact is ${delivery.bytes.byteLength} bytes; max direct delivery size is ${MAX_ARTIFACT_DELIVERY_BYTES} bytes.`,
        );
      }
      const channel = originChannel(body.origin);
      return toolData({
        artifactId: delivery.artifact.id,
        filename: delivery.filename,
        mimeType: delivery.artifact.mime_type,
        byteSize: delivery.artifact.byte_size,
        sha256: delivery.artifact.sha256,
        contentBase64: Buffer.from(delivery.bytes).toString("base64"),
        delivery: { kind: "native_attachment", channel },
      });
    });
    return c.json(result);
  });
}
