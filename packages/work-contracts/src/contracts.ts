import {
  defineReadTool,
  defineWriteTool,
  emptyParams,
  readToolDescription,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  profileWorkItemGetInputSchema,
  profileWorkItemGetOutputSchema,
  profileWorkItemListInputSchema,
  profileWorkItemListOutputSchema,
  profileWorkRouteCreateInputSchema,
  profileWorkRouteDeleteInputSchema,
  profileWorkRouteListOutputSchema,
  profileWorkRouteOutputSchema,
  profileWorkRouteUpdateInputSchema,
} from "./schemas";

export const WORK_PLUGIN_ID = "work-tools";

export const workToolContracts = [
  defineReadTool({
    name: "work_item_get",
    pluginId: WORK_PLUGIN_ID,
    label: "Get Work Item",
    description: readToolDescription({
      useWhen: "one assistant work item needs inspection by id",
      operation: "Fetches one assistant work item for this profile",
      returns: "work item details, curated event facts, current status, and resolved guidance",
    }),
    inputSchema: profileWorkItemGetInputSchema,
    outputSchema: profileWorkItemGetOutputSchema,
  }),
  defineReadTool({
    name: "work_item_list",
    pluginId: WORK_PLUGIN_ID,
    label: "List Work Items",
    description: readToolDescription({
      useWhen: "the user asks to inspect queued tasks without executing the next item now",
      operation: "Lists assistant work items for this profile",
      returns: "work item summaries and statuses",
      doNotUse:
        "the user wants pending backend work executed; backend jobs execute work items directly",
    }),
    inputSchema: profileWorkItemListInputSchema,
    outputSchema: profileWorkItemListOutputSchema,
  }),
  defineReadTool({
    name: "work_route_list",
    pluginId: WORK_PLUGIN_ID,
    label: "List Work Routes",
    description: readToolDescription({
      useWhen: "the user asks what provider events currently trigger queued assistant work",
      operation: "Lists profile triggers that route provider events into work items",
      returns:
        "trigger ids, event types, optional connected-account scope, instructions, priorities, and timestamps",
    }),
    inputSchema: emptyParams,
    outputSchema: profileWorkRouteListOutputSchema,
  }),
  defineWriteTool({
    name: "work_route_create",
    pluginId: WORK_PLUGIN_ID,
    label: "Create Work Route",
    description: writeToolDescription({
      useWhen: "the user wants provider events to trigger queued assistant work",
      operation: "Creates one profile trigger for a supported provider event type",
      returns: "the created trigger",
      notes: [
        "Keep instructions focused on what this provider event should trigger.",
        "Omit connectedProviderAccountId to create the default route for an event type. Pass it only when the route should apply to one connected provider account.",
        "If reusable workflow rules already exist in profile guidance, reference that guidance by title/key instead of copying the full workflow into the route.",
      ],
      sideEffect: "creates durable trigger configuration",
      safety: "event type and trigger instructions must be clear",
    }),
    inputSchema: profileWorkRouteCreateInputSchema,
    outputSchema: profileWorkRouteOutputSchema,
    trustedChannelRequired: false,
  }),
  defineWriteTool({
    name: "work_route_update",
    pluginId: WORK_PLUGIN_ID,
    label: "Update Work Route",
    description: writeToolDescription({
      useWhen: "the user wants to change an existing provider-event trigger",
      operation: "Updates a work route's instructions or priority",
      returns: "the updated trigger",
      notes: [
        "Prefer short event-specific instructions that reference relevant profile guidance by title/key for reusable workflow details.",
      ],
      sideEffect: "mutates durable trigger configuration",
      safety: "only changed fields should be passed and the exact trigger must be clear",
    }),
    inputSchema: profileWorkRouteUpdateInputSchema,
    outputSchema: profileWorkRouteOutputSchema,
    trustedChannelRequired: false,
  }),
  defineWriteTool({
    name: "work_route_delete",
    pluginId: WORK_PLUGIN_ID,
    label: "Delete Work Route",
    description: writeToolDescription({
      useWhen: "the user wants a provider-event trigger to stop creating queued assistant work",
      operation: "Deletes one profile trigger",
      returns: "the deleted trigger",
      sideEffect: "removes durable trigger configuration",
      safety: "the exact trigger id must be clear",
    }),
    inputSchema: profileWorkRouteDeleteInputSchema,
    outputSchema: profileWorkRouteOutputSchema,
    trustedChannelRequired: false,
  }),
] as const satisfies readonly ToolContract[];

export type WorkToolName = (typeof workToolContracts)[number]["name"];
