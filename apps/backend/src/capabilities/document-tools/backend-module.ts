import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import type { ExecutorContext } from "../../runtime/agent-tools/executor/context";
import { documentTemplateRenderTool } from "./render-tool";

import { documentConvertToPdfTool } from "./convert-tool";
import { documentCreatePdfTool } from "./create-pdf-tool";
import { documentPdfPreviewCreateTool } from "./pdf-preview-tool";
import { documentSourceGetTool } from "./source-get-tool";

export const documentBackendCapabilityModule = defineBackendCapabilityModule({
  id: "document-tools",
  contracts: documentToolContracts,
  immediateHandlers: {
    document_create_pdf: (ctx: ExecutorContext) =>
      documentCreatePdfTool(ctx.db, ctx.profile.id, ctx.params),
    document_source_get: (ctx: ExecutorContext) =>
      documentSourceGetTool(ctx.db, ctx.profile.id, ctx.params),
    document_pdf_preview_create: (ctx: ExecutorContext) =>
      documentPdfPreviewCreateTool(ctx.db, ctx.profile.id, ctx.params),
    document_template_render: (ctx: ExecutorContext) =>
      documentTemplateRenderTool(ctx.db, ctx.profile.id, ctx.params),
    document_convert_to_pdf: (ctx: ExecutorContext) =>
      documentConvertToPdfTool(ctx.db, ctx.profile.id, ctx.params),
  },
  externalWriteContracts: [],
});
