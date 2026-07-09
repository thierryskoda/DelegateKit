import {
  defineReadTool,
  emptyParams,
  toolDescription,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";
import {
  coveredToolCatalog,
  coveredToolSubset,
  defineMaintainerSkill,
  focusedSkill,
  judge,
  md,
  npmScript,
  repoPath,
  tool,
  toolList,
} from "./index";

const sampleContracts = [
  defineReadTool({
    name: "sample_read",
    pluginId: "sample-tools",
    label: "Sample Read",
    description: toolDescription`Sample read tool for compile-time skill authoring tests.`,
    inputSchema: emptyParams,
    outputSchema: z.object({ sample: z.string() }).strict(),
  }),
  defineReadTool({
    name: "sample_status",
    pluginId: "sample-tools",
    label: "Sample Status",
    description: toolDescription`Sample status tool for compile-time skill authoring tests.`,
    inputSchema: emptyParams,
    outputSchema: z.object({ status: z.string() }).strict(),
  }),
] as const;

tool(sampleContracts, "sample_read");
const sampleToolList = toolList(sampleContracts);
const sampleToolListMarkdown: string = sampleToolList.markdown;
void sampleToolListMarkdown;
const sampleCoveredToolCatalog = coveredToolCatalog(sampleContracts, {
  sample_read: true,
  sample_status: true,
});
const sampleCoveredToolCatalogMarkdown: string = sampleCoveredToolCatalog.markdown;
void sampleCoveredToolCatalogMarkdown;
const sampleCoveredToolSubset = coveredToolSubset(sampleContracts, {
  include: { sample_status: true },
  omit: { sample_read: "Not useful in this generated guidance." },
});
const sampleCoveredToolSubsetName: "sample_status" = sampleCoveredToolSubset[0]!.name;
void sampleCoveredToolSubsetName;

// @ts-expect-error Unknown tool names must fail at compile time.
tool(sampleContracts, "sample_write");

// @ts-expect-error Covered tool catalogs must include every contract tool.
coveredToolCatalog(sampleContracts, { sample_read: true });

// Covered tool catalogs must reject stale or unknown contract tool keys.
coveredToolCatalog(sampleContracts, {
  sample_read: true,
  sample_status: true,
  // @ts-expect-error Covered tool catalogs must reject stale or unknown contract tool keys.
  sample_write: true,
});

// @ts-expect-error Covered tool subsets must include or omit every contract tool.
coveredToolSubset(sampleContracts, {
  include: { sample_status: true },
  omit: {},
});

// @ts-expect-error Covered tool subsets must reject stale include keys.
coveredToolSubset(sampleContracts, {
  include: { sample_status: true, sample_write: true },
  omit: { sample_read: "Not useful in this generated guidance." },
});

// @ts-expect-error Covered tool subsets must reject stale omit keys.
coveredToolSubset(sampleContracts, {
  include: { sample_status: true },
  omit: {
    sample_read: "Not useful in this generated guidance.",
    sample_write: "No longer exists.",
  },
});

// @ts-expect-error Covered tool subsets must reject the same key in include and omit.
coveredToolSubset(sampleContracts, {
  include: { sample_status: true },
  omit: {
    sample_read: "Not useful in this generated guidance.",
    sample_status: "Duplicate coverage.",
  },
});

defineMaintainerSkill({
  name: "sample-maintainer-skill",
  description:
    "Sample maintainer skill with explicit branded references for compile-time coverage.",
  references: [
    npmScript("typecheck"),
    repoPath("package.json"),
    focusedSkill("housekeeping"),
    judge("plugin-boundary-overlap"),
  ],
  body: md`
Use typed maintainer references.
  `,
});
