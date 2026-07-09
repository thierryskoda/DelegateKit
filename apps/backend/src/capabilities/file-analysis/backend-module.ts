import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { defineBackendCapabilityModule } from "../registry/backend-capability-module";
import type { ExecutorContext } from "../../runtime/agent-tools/executor/context";
import { fileDescribeTool, fileExtractDataTool, fileExtractTextTool } from "./tools";

export const fileAnalysisBackendCapabilityModule = defineBackendCapabilityModule({
  id: "file-analysis",
  contracts: fileAnalysisToolContracts,
  immediateHandlers: {
    file_extract_text: (ctx: ExecutorContext) =>
      fileExtractTextTool(ctx.db, ctx.profile.id, ctx.params),
    file_describe: (ctx: ExecutorContext) => fileDescribeTool(ctx.db, ctx.profile.id, ctx.params),
    file_extract_data: (ctx: ExecutorContext) =>
      fileExtractDataTool(ctx.db, ctx.profile.id, ctx.params),
  },
  externalWriteContracts: [],
});
