import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { artifactDiagnosticAttrs } from "../../shared/lifecycle-diagnostics";
import { recordArtifactCreatedActivitySafe } from "../agent-activity/agent-activity";

type ArtifactInput = {
  profileId: string;
  storageKey: string;
  filename: string;
  artifactType: string;
  storageBucket?: string;
  browserTaskId?: string | null;
  profileActionId?: string | null;
  description?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  sha256?: string | null;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
};

export async function recordArtifact(
  db: SupabaseServiceClient,
  input: ArtifactInput,
): Promise<TableRow<"artifacts">> {
  const inserted = await db
    .from("artifacts")
    .insert({
      profile_id: input.profileId,
      browser_task_id: input.browserTaskId ?? null,
      profile_action_id: input.profileActionId ?? null,
      storage_bucket: input.storageBucket ?? "profile-artifacts",
      storage_key: input.storageKey,
      filename: input.filename,
      idempotency_key: input.idempotencyKey ?? null,
      description: input.description ?? null,
      artifact_type: input.artifactType,
      mime_type: input.mimeType ?? null,
      byte_size: input.byteSize ?? null,
      sha256: input.sha256 ?? null,
      metadata: requireJsonObject(input.metadata ?? {}, "artifact.metadata"),
    })
    .select()
    .single();
  const artifact = requireSupabaseData("Insert artifacts row", inserted.data, inserted.error);
  emitDiagnostic(backendDiagnosticLogger(), "artifact.recorded", {
    ok: true,
    profile_id: artifact.profile_id,
    action_id: artifact.profile_action_id,
    attrs: artifactDiagnosticAttrs(artifact),
  });
  await recordArtifactCreatedActivitySafe(db, artifact);
  return artifact;
}
