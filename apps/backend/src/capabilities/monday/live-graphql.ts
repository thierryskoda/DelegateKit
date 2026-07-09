import { z } from "zod";
import { type NangoProxySandboxContext } from "../../integrations/nango/nango-proxy-client";
import {
  mondayProxyGraphql,
  mondayProxyGraphqlFile,
  mondayProviderId,
  mondayRequireObject,
} from "./graphql-proxy";

const mondayLiveIdSchema = z.union([z.string().min(1), z.number()]);

const mondayLiveRawColumnValueSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    value: z.unknown().optional(),
  })
  .passthrough();

const mondayLiveRawBoardRefSchema = z
  .object({
    id: mondayLiveIdSchema,
    name: z.string().nullable().optional(),
  })
  .passthrough();

const mondayLiveRawGroupRefSchema = z
  .object({
    id: mondayLiveIdSchema,
    title: z.string().nullable().optional(),
  })
  .passthrough();

const mondayLiveRawUserRefSchema = z
  .object({
    id: mondayLiveIdSchema.optional(),
    name: z.string().nullable().optional(),
  })
  .passthrough();

const mondayLiveRawUpdateSchema: z.ZodType<{
  id: string | number;
  body?: string | null | undefined;
  text_body?: string | null | undefined;
  created_at?: string | null | undefined;
  updated_at?: string | null | undefined;
  creator?: { id?: string | number | undefined; name?: string | null | undefined } | null | undefined;
  assets?: Array<{
    id: string | number;
    name?: string | null | undefined;
    url?: string | null | undefined;
    public_url?: string | null | undefined;
    file_extension?: string | null | undefined;
    file_size?: number | null | undefined;
  }> | undefined;
  replies?: Array<{
    id: string | number;
    body?: string | null | undefined;
    text_body?: string | null | undefined;
    created_at?: string | null | undefined;
    updated_at?: string | null | undefined;
    creator?: { id?: string | number | undefined; name?: string | null | undefined } | null | undefined;
    assets?: Array<{
      id: string | number;
      name?: string | null | undefined;
      url?: string | null | undefined;
      public_url?: string | null | undefined;
      file_extension?: string | null | undefined;
      file_size?: number | null | undefined;
    }> | undefined;
  }> | undefined;
}> = z.lazy(() =>
  z
    .object({
      id: mondayLiveIdSchema,
      body: z.string().nullable().optional(),
      text_body: z.string().nullable().optional(),
      created_at: z.string().nullable().optional(),
      updated_at: z.string().nullable().optional(),
      creator: mondayLiveRawUserRefSchema.nullable().optional(),
      assets: z
        .array(
          z
            .object({
              id: mondayLiveIdSchema,
              name: z.string().nullable().optional(),
              url: z.string().nullable().optional(),
              public_url: z.string().nullable().optional(),
              file_extension: z.string().nullable().optional(),
              file_size: z.number().nullable().optional(),
            })
            .passthrough(),
        )
        .optional(),
      replies: z.array(mondayLiveRawUpdateSchema).optional(),
    })
    .passthrough(),
);

const mondayLiveRawItemSchema = z
  .object({
    id: mondayLiveIdSchema,
    name: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    board: mondayLiveRawBoardRefSchema.optional(),
    group: mondayLiveRawGroupRefSchema.nullable().optional(),
    column_values: z.array(mondayLiveRawColumnValueSchema).optional(),
  })
  .passthrough();

const mondayLiveRawItemsPageSchema = z
  .object({
    cursor: z.string().nullable().optional(),
    items: z.array(mondayLiveRawItemSchema).optional(),
  })
  .passthrough();

const mondayLiveRawDiscoveryColumnSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    settings: z.unknown().optional(),
    settings_str: z.string().nullable().optional(),
  })
  .passthrough();

const mondayLiveRawDiscoveryGroupSchema = z
  .object({
    id: mondayLiveIdSchema,
    title: z.string().nullable().optional(),
  })
  .passthrough();

const mondayLiveRawWorkspaceSchema = z
  .object({
    id: mondayLiveIdSchema,
    name: z.string().nullable().optional(),
    kind: z.string().nullable().optional(),
  })
  .passthrough();

const mondayLiveRawDiscoveryBoardSchema = z
  .object({
    id: mondayLiveIdSchema,
    name: z.string().nullable().optional(),
    object_type_unique_key: z.string().nullable().optional(),
    hierarchy_type: z.string().nullable().optional(),
    columns: z.array(mondayLiveRawDiscoveryColumnSchema).optional(),
    groups: z.array(mondayLiveRawDiscoveryGroupSchema).optional(),
    items_page: mondayLiveRawItemsPageSchema.optional(),
  })
  .passthrough();

const mondayLiveDiscoveryOutputSchema = z
  .object({
    boards: z.array(mondayLiveRawDiscoveryBoardSchema).optional(),
  })
  .passthrough();

const mondayLiveWorkspaceListOutputSchema = z
  .object({
    workspaces: z.array(mondayLiveRawWorkspaceSchema).optional(),
  })
  .passthrough();

const mondayLiveBoardItemsPageOutputSchema = z
  .object({
    boards: z
      .array(
        z
          .object({
            items_page: mondayLiveRawItemsPageSchema.optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const mondayLiveColumnValueSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().nullable(),
    type: z.string().nullable(),
    value: z.unknown(),
  })
  .strict();

const mondayLiveItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().nullable(),
    state: z.string().nullable(),
    boardId: z.string().min(1),
    boardName: z.string().nullable(),
    groupId: z.string().nullable(),
    groupTitle: z.string().nullable(),
    columnValues: z.array(mondayLiveColumnValueSchema),
  })
  .strict();

const mondayLiveItemsPageSchema = z
  .object({
    items: z.array(mondayLiveItemSchema),
    cursor: z.string().nullable(),
  })
  .strict();

const mondayLiveUpdateCreatorSchema = z
  .object({
    userId: z.string().nullable(),
    name: z.string().nullable(),
  })
  .strict();

const mondayLiveUpdateAssetSchema = z
  .object({
    assetId: z.string().min(1),
    name: z.string().nullable(),
    url: z.string().nullable(),
    publicUrl: z.string().nullable(),
    fileExtension: z.string().nullable(),
    fileSize: z.number().nullable(),
  })
  .strict();

const mondayLiveUpdateSchema = z
  .object({
    updateId: z.string().min(1),
    itemId: z.string().min(1),
    body: z.string().nullable(),
    textBody: z.string().nullable(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    creator: mondayLiveUpdateCreatorSchema,
    assets: z.array(mondayLiveUpdateAssetSchema),
    replies: z.array(
      z
        .object({
          updateId: z.string().min(1),
          body: z.string().nullable(),
          textBody: z.string().nullable(),
          createdAt: z.string().nullable(),
          updatedAt: z.string().nullable(),
          creator: mondayLiveUpdateCreatorSchema,
          assets: z.array(mondayLiveUpdateAssetSchema),
        })
        .strict(),
    ),
  })
  .strict();

export type MondayLiveRawDiscoveryBoard = z.infer<typeof mondayLiveRawDiscoveryBoardSchema>;
type MondayLiveColumnValue = z.infer<typeof mondayLiveColumnValueSchema>;
export type MondayLiveItem = z.infer<typeof mondayLiveItemSchema>;
export type MondayLiveItemsPage = z.infer<typeof mondayLiveItemsPageSchema>;
export type MondayLiveUpdate = z.infer<typeof mondayLiveUpdateSchema>;

export type MondayLiveConnectionInput = {
  providerConfigKey: string;
  connectionId: string;
  sandbox?: NangoProxySandboxContext;
};

export async function mondayLiveListWorkspaces(input: MondayLiveConnectionInput & {
}): Promise<Array<{ workspaceId: string; name: string; kind: string | null }>> {
  const data = await mondayProxyGraphql({
    operation: "monday.workspace.list",
    publicSummary: "Monday workspace list failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `query MondayWorkspaces { workspaces { id name kind } }`,
  });
  const parsed = mondayLiveWorkspaceListOutputSchema.parse(data);
  return (parsed.workspaces ?? []).flatMap((workspace) => {
    const workspaceId = mondayProviderId(workspace);
    if (!workspaceId) return [];
    return [
      {
        workspaceId,
        name: typeof workspace.name === "string" ? workspace.name : "",
        kind: typeof workspace.kind === "string" ? workspace.kind : null,
      },
    ];
  });
}

const DISCOVERY_QUERY = `
  query MondayDiscovery($boardLimit: Int!, $itemsLimit: Int!) {
    boards(limit: $boardLimit) {
      id
      name
      object_type_unique_key
      hierarchy_type
      columns { id title type settings settings_str }
      groups { id title }
      items_page(limit: $itemsLimit) {
        items {
          id
          name
          group { id title }
          column_values { id text type value }
        }
      }
    }
  }
`;

const DISCOVERY_BY_IDS_QUERY = `
  query MondayDiscoveryByIds($boardIds: [ID!]!, $itemsLimit: Int!) {
    boards(ids: $boardIds) {
      id
      name
      object_type_unique_key
      hierarchy_type
      columns { id title type settings settings_str }
      groups { id title }
      items_page(limit: $itemsLimit) {
        items {
          id
          name
          group { id title }
          column_values { id text type value }
        }
      }
    }
  }
`;

export async function mondayLiveDiscoverBoards(input: MondayLiveConnectionInput & {
  boardLimit: number;
  sampleItemsPerBoard: number;
  providerBoardIds?: readonly string[];
}): Promise<{ boards: MondayLiveRawDiscoveryBoard[] }> {
  const boardIds = [
    ...new Set(input.providerBoardIds?.map((id) => id.trim()).filter(Boolean) ?? []),
  ];
  if (boardIds.length > 0) {
    const data = await mondayProxyGraphql({
      operation: "monday.discovery",
      publicSummary: "Monday discovery query failed",
      providerConfigKey: input.providerConfigKey,
      connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
      query: DISCOVERY_BY_IDS_QUERY,
      variables: { boardIds, itemsLimit: input.sampleItemsPerBoard },
    });
    const parsed = mondayLiveDiscoveryOutputSchema.parse(data);
    return { boards: parsed.boards ?? [] };
  }

  const data = await mondayProxyGraphql({
    operation: "monday.discovery",
    publicSummary: "Monday discovery query failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: DISCOVERY_QUERY,
    variables: { boardLimit: input.boardLimit, itemsLimit: input.sampleItemsPerBoard },
  });
  const parsed = mondayLiveDiscoveryOutputSchema.parse(data);
  return { boards: parsed.boards ?? [] };
}

export async function mondayLiveGetBoard(input: MondayLiveConnectionInput & {
  providerBoardId: string;
}): Promise<MondayLiveRawDiscoveryBoard | null> {
  const result = await mondayLiveDiscoverBoards({
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    boardLimit: 1,
    sampleItemsPerBoard: 0,
    providerBoardIds: [input.providerBoardId],
  });
  return result.boards[0] ?? null;
}

function parseColumnValue(raw: unknown): MondayLiveColumnValue | null {
  const parsed = mondayLiveRawColumnValueSchema.safeParse(raw);
  if (!parsed.success) return null;
  const record = parsed.data;
  const rawValue = record["value"];
  let value: unknown = rawValue ?? null;
  if (typeof rawValue === "string" && rawValue.trim()) {
    try {
      value = JSON.parse(rawValue) as unknown;
    } catch {
      value = rawValue;
    }
  }
  return {
    id: record["id"],
    text: typeof record["text"] === "string" ? record["text"] : null,
    type: typeof record["type"] === "string" ? record["type"] : null,
    value,
  };
}

function parseLiveItem(raw: unknown): MondayLiveItem | null {
  const parsed = mondayLiveRawItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  const id = mondayProviderId(item);
  const board = item.board;
  const boardId = board ? mondayProviderId(board) : null;
  if (!id || !boardId) return null;
  const group = item.group ?? null;
  const rawColumns = item.column_values ?? [];
  return mondayLiveItemSchema.parse({
    id,
    name: typeof item["name"] === "string" ? item["name"] : null,
    state: typeof item["state"] === "string" ? item["state"] : null,
    boardId,
    boardName: board && typeof board["name"] === "string" ? board["name"] : null,
    groupId: group ? (mondayProviderId(group) ?? null) : null,
    groupTitle: group && typeof group["title"] === "string" ? group["title"] : null,
    columnValues: rawColumns.flatMap((column) => {
      const parsed = parseColumnValue(column);
      return parsed ? [parsed] : [];
    }),
  });
}

export async function mondayLiveGetItem(input: MondayLiveConnectionInput & {
  providerItemId: string;
}): Promise<MondayLiveItem | null> {
  const data = await mondayProxyGraphql({
    operation: "monday.item.get",
    publicSummary: "Monday item fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `query MondayItemById($itemIds: [ID!]!) {
      items(ids: $itemIds) {
        id
        name
        state
        board { id name }
        group { id title }
        column_values { id text type value }
      }
    }`,
    variables: { itemIds: [input.providerItemId] },
  });
  const items = z.array(mondayLiveRawItemSchema).optional().parse(data["items"]) ?? [];
  return parseLiveItem(items[0]);
}

function parseItemsPage(raw: unknown): MondayLiveItemsPage {
  const parsed = mondayLiveRawItemsPageSchema.safeParse(raw);
  if (!parsed.success) return { items: [], cursor: null };
  const page = parsed.data;
  const rawItems = page.items ?? [];
  return mondayLiveItemsPageSchema.parse({
    cursor: typeof page.cursor === "string" && page.cursor.trim() ? page.cursor : null,
    items: rawItems.flatMap((rawItem) => {
      const parsed = parseLiveItem(rawItem);
      return parsed ? [parsed] : [];
    }),
  });
}

export async function mondayLiveListItems(input: MondayLiveConnectionInput & {
  providerBoardId: string;
  limit: number;
  cursor?: string;
  queryParams?: Record<string, unknown>;
}): Promise<MondayLiveItemsPage> {
  if (input.cursor?.trim()) {
    const data = await mondayProxyGraphql({
      operation: "monday.item.list.next",
      publicSummary: "Monday next_items_page failed",
      providerConfigKey: input.providerConfigKey,
      connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
      query: `query MondayNextItemsPage($cursor: String!, $limit: Int!) {
        next_items_page(cursor: $cursor, limit: $limit) {
          cursor
          items {
            id
            name
            state
            board { id name }
            group { id title }
            column_values { id text type value }
          }
        }
      }`,
      variables: { cursor: input.cursor.trim(), limit: input.limit },
    });
    return parseItemsPage(data["next_items_page"]);
  }

  const data = await mondayProxyGraphql({
    operation: "monday.item.list",
    publicSummary: "Monday items_page failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `query MondayBoardItemsPage($boardIds: [ID!]!, $limit: Int!, $queryParams: ItemsQuery) {
      boards(ids: $boardIds) {
        items_page(limit: $limit, query_params: $queryParams) {
          cursor
          items {
            id
            name
            state
            board { id name }
            group { id title }
            column_values { id text type value }
          }
        }
      }
    }`,
    variables: {
      boardIds: [input.providerBoardId],
      limit: input.limit,
      queryParams: input.queryParams ?? null,
    },
  });
  const parsed = mondayLiveBoardItemsPageOutputSchema.parse(data);
  return parseItemsPage(parsed.boards?.[0]?.items_page);
}

function parseUpdateCreator(raw: unknown) {
  const parsed = mondayLiveRawUserRefSchema.safeParse(raw);
  if (!parsed.success) return { userId: null, name: null };
  return {
    userId: mondayProviderId(parsed.data) ?? null,
    name: typeof parsed.data.name === "string" ? parsed.data.name : null,
  };
}

function parseUpdateAsset(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const assetId = mondayProviderId(record);
  if (!assetId) return null;
  return mondayLiveUpdateAssetSchema.parse({
    assetId,
    name: typeof record["name"] === "string" ? record["name"] : null,
    url: typeof record["url"] === "string" ? record["url"] : null,
    publicUrl: typeof record["public_url"] === "string" ? record["public_url"] : null,
    fileExtension: typeof record["file_extension"] === "string" ? record["file_extension"] : null,
    fileSize: typeof record["file_size"] === "number" ? record["file_size"] : null,
  });
}

function parseLiveUpdate(raw: unknown, itemId: string): MondayLiveUpdate | null {
  const parsed = mondayLiveRawUpdateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const update = parsed.data;
  const updateId = mondayProviderId(update);
  if (!updateId) return null;
  return mondayLiveUpdateSchema.parse({
    updateId,
    itemId,
    body: typeof update.body === "string" ? update.body : null,
    textBody: typeof update.text_body === "string" ? update.text_body : null,
    createdAt: typeof update.created_at === "string" ? update.created_at : null,
    updatedAt: typeof update.updated_at === "string" ? update.updated_at : null,
    creator: parseUpdateCreator(update.creator ?? null),
    assets: (update.assets ?? []).flatMap((asset) => {
      const parsed = parseUpdateAsset(asset);
      return parsed ? [parsed] : [];
    }),
    replies: (update.replies ?? []).flatMap((reply) => {
      const parsedReply = parseLiveUpdate(reply, itemId);
      if (!parsedReply) return [];
      return [
        {
          updateId: parsedReply.updateId,
          body: parsedReply.body,
          textBody: parsedReply.textBody,
          createdAt: parsedReply.createdAt,
          updatedAt: parsedReply.updatedAt,
          creator: parsedReply.creator,
          assets: parsedReply.assets,
        },
      ];
    }),
  });
}

export async function mondayLiveListItemUpdates(input: MondayLiveConnectionInput & {
  providerItemId: string;
  includeReplies: boolean;
  page: number;
  limit: number;
}): Promise<{ itemId: string; page: number; limit: number; updates: MondayLiveUpdate[] }> {
  const repliesSelection = input.includeReplies
    ? `replies {
        id
        body
        text_body
        created_at
        updated_at
        creator { id name }
        assets {
          id
          name
          url
          public_url
          file_extension
          file_size
        }
      }`
    : "";
  const data = await mondayProxyGraphql({
    operation: "monday.update.list",
    publicSummary: "Monday item updates fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `query MondayItemUpdates($itemIds: [ID!]!, $limit: Int!, $page: Int!) {
      items(ids: $itemIds) {
        id
        updates(limit: $limit, page: $page) {
          id
          body
          text_body
          created_at
          updated_at
          creator { id name }
          assets {
            id
            name
            url
            public_url
            file_extension
            file_size
          }
          ${repliesSelection}
        }
      }
    }`,
    variables: { itemIds: [input.providerItemId], limit: input.limit, page: input.page },
  });
  const items = z
    .array(z.object({ id: mondayLiveIdSchema, updates: z.array(mondayLiveRawUpdateSchema).optional() }).passthrough())
    .optional()
    .parse(data["items"]) ?? [];
  const item = items[0];
  if (!item) return { itemId: input.providerItemId, page: input.page, limit: input.limit, updates: [] };
  const itemId = mondayProviderId(item) ?? input.providerItemId;
  return {
    itemId,
    page: input.page,
    limit: input.limit,
    updates: (item.updates ?? []).flatMap((update) => {
      const parsed = parseLiveUpdate(update, itemId);
      return parsed ? [parsed] : [];
    }),
  };
}

export async function mondayLiveListSubitems(input: MondayLiveConnectionInput & {
  parentItemId: string;
  limit: number;
}): Promise<{ parentItem: MondayLiveItem; subitems: MondayLiveItem[] }> {
  const data = await mondayProxyGraphql({
    operation: "monday.subitem.list",
    publicSummary: "Monday subitems fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `query MondaySubitems($itemIds: [ID!]!) {
      items(ids: $itemIds) {
        id
        name
        state
        board { id name }
        group { id title }
        column_values { id text type value }
        subitems {
          id
          name
          state
          board { id name }
          group { id title }
          column_values { id text type value }
        }
      }
    }`,
    variables: { itemIds: [input.parentItemId] },
  });
  const items = z.array(mondayLiveRawItemSchema).optional().parse(data["items"]) ?? [];
  const parentItem = parseLiveItem(items[0]);
  if (!parentItem) throw new Error(`Monday parent item ${input.parentItemId} was not found.`);
  const rawSubitems = Array.isArray((items[0] as Record<string, unknown> | undefined)?.["subitems"])
    ? ((items[0] as Record<string, unknown>)["subitems"] as unknown[])
    : [];
  return {
    parentItem,
    subitems: rawSubitems
      .flatMap((subitem) => {
        const parsed = parseLiveItem(subitem);
        return parsed ? [parsed] : [];
      })
      .slice(0, input.limit),
  };
}

export async function mondayLiveCreateUpdate(input: MondayLiveConnectionInput & {
  providerItemId: string;
  body: string;
}): Promise<{ updateId: string; itemId: string; body: string | null; textBody: string | null; createdAt: string | null; creatorName: string | null }> {
  const data = await mondayProxyGraphql({
    operation: "monday.update.create",
    publicSummary: "Monday create_update failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation CreateUpdate($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
        body
        text_body
        created_at
        creator { id name }
      }
    }`,
    variables: { itemId: input.providerItemId, body: input.body },
  });
  const update = mondayRequireObject(data, "create_update", "create_update");
  const updateId = mondayProviderId(update);
  if (!updateId) throw new Error("Monday create_update returned no id.");
  return {
    updateId,
    itemId: input.providerItemId,
    body: typeof update["body"] === "string" ? update["body"] : null,
    textBody: typeof update["text_body"] === "string" ? update["text_body"] : null,
    createdAt: typeof update["created_at"] === "string" ? update["created_at"] : null,
    creatorName: textValueFromObject(update["creator"], "name"),
  };
}

export async function mondayLiveEditUpdate(input: MondayLiveConnectionInput & {
  updateId: string;
  body: string;
}): Promise<{ updateId: string; body: string | null; textBody: string | null }> {
  const data = await mondayProxyGraphql({
    operation: "monday.update.edit",
    publicSummary: "Monday edit_update failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation EditUpdate($updateId: ID!, $body: String!) {
      edit_update(id: $updateId, body: $body) {
        id
        body
        text_body
      }
    }`,
    variables: { updateId: input.updateId, body: input.body },
  });
  const update = mondayRequireObject(data, "edit_update", "edit_update");
  const updateId = mondayProviderId(update);
  if (!updateId) throw new Error("Monday edit_update returned no id.");
  return {
    updateId,
    body: typeof update["body"] === "string" ? update["body"] : null,
    textBody: typeof update["text_body"] === "string" ? update["text_body"] : null,
  };
}

export async function mondayLiveDeleteUpdate(input: MondayLiveConnectionInput & {
  updateId: string;
}): Promise<{ updateId: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.update.delete",
    publicSummary: "Monday delete_update failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation DeleteUpdate($updateId: ID!) {
      delete_update(id: $updateId) {
        id
      }
    }`,
    variables: { updateId: input.updateId },
  });
  const update = mondayRequireObject(data, "delete_update", "delete_update");
  const updateId = mondayProviderId(update);
  if (!updateId) throw new Error("Monday delete_update returned no id.");
  return { updateId };
}

export async function mondayLiveCreateSubitem(input: MondayLiveConnectionInput & {
  parentItemId: string;
  itemName: string;
  providerFields: Record<string, unknown>;
}): Promise<{ id: string; name: string | null; boardId: string | null; boardName: string | null }> {
  const hasColumnValues = Object.keys(input.providerFields).length > 0;
  const data = await mondayProxyGraphql({
    operation: "monday.subitem.create",
    publicSummary: "Monday create_subitem failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: hasColumnValues
      ? `mutation CreateSubitem($parentItemId: ID!, $itemName: String!, $columnValues: JSON!) {
          create_subitem(parent_item_id: $parentItemId, item_name: $itemName, column_values: $columnValues) {
            id
            name
            board { id name }
          }
        }`
      : `mutation CreateSubitem($parentItemId: ID!, $itemName: String!) {
          create_subitem(parent_item_id: $parentItemId, item_name: $itemName) {
            id
            name
            board { id name }
          }
        }`,
    variables: {
      parentItemId: input.parentItemId,
      itemName: input.itemName,
      ...(hasColumnValues ? { columnValues: JSON.stringify(input.providerFields) } : {}),
    },
  });
  const subitem = mondayRequireObject(data, "create_subitem", "create_subitem");
  const id = mondayProviderId(subitem);
  if (!id) throw new Error("Monday create_subitem returned no id.");
  const board = subitem["board"];
  const boardRecord = board && typeof board === "object" && !Array.isArray(board) ? board as Record<string, unknown> : null;
  return {
    id,
    name: typeof subitem["name"] === "string" ? subitem["name"] : null,
    boardId: boardRecord ? mondayProviderId(boardRecord) ?? null : null,
    boardName: boardRecord && typeof boardRecord["name"] === "string" ? boardRecord["name"] : null,
  };
}

function textValueFromObject(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : null;
}

function parseLiveAssetResult(raw: unknown) {
  const asset = mondayRequireObject({ asset: raw }, "asset", "asset upload");
  const assetId = mondayProviderId(asset);
  if (!assetId) throw new Error("Monday file upload returned no asset id.");
  return {
    assetId,
    name: typeof asset["name"] === "string" ? asset["name"] : null,
    url: typeof asset["url"] === "string" ? asset["url"] : null,
    publicUrl: typeof asset["public_url"] === "string" ? asset["public_url"] : null,
  };
}

export async function mondayLiveAddFileToColumn(input: MondayLiveConnectionInput & {
  authHeaders: Record<string, string>;
  providerItemId: string;
  columnId: string;
  file: { filename: string; mimeType: string; bytes: Uint8Array };
}): Promise<{ assetId: string; name: string | null; url: string | null; publicUrl: string | null }> {
  const data = await mondayProxyGraphqlFile({
    operation: "monday.file.add_to_column",
    publicSummary: "Monday add_file_to_column failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    authHeaders: input.authHeaders,
    query: `mutation AddFileToColumn($itemId: ID!, $columnId: String!, $file: File!) {
      add_file_to_column(item_id: $itemId, column_id: $columnId, file: $file) {
        id
        name
        url
        public_url
      }
    }`,
    variables: { itemId: input.providerItemId, columnId: input.columnId },
    fileVariableName: "file",
    file: input.file,
  });
  return parseLiveAssetResult(data["add_file_to_column"]);
}

export async function mondayLiveAddFileToUpdate(input: MondayLiveConnectionInput & {
  authHeaders: Record<string, string>;
  updateId: string;
  file: { filename: string; mimeType: string; bytes: Uint8Array };
}): Promise<{ assetId: string; name: string | null; url: string | null; publicUrl: string | null }> {
  const data = await mondayProxyGraphqlFile({
    operation: "monday.file.add_to_update",
    publicSummary: "Monday add_file_to_update failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    authHeaders: input.authHeaders,
    query: `mutation AddFileToUpdate($updateId: ID!, $file: File!) {
      add_file_to_update(update_id: $updateId, file: $file) {
        id
        name
        url
        public_url
      }
    }`,
    variables: { updateId: input.updateId },
    fileVariableName: "file",
    file: input.file,
  });
  return parseLiveAssetResult(data["add_file_to_update"]);
}

export async function mondayLiveCreateItem(input: MondayLiveConnectionInput & {
  providerBoardId: string;
  itemName: string;
  providerFields: Record<string, unknown>;
  groupId?: string;
}): Promise<{ id: string; name: string | null | undefined }> {
  const withGroup = typeof input.groupId === "string" && input.groupId.trim().length > 0;
  const data = await mondayProxyGraphql({
    operation: "monday.item.create",
    publicSummary: "Monday create_item failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: withGroup
      ? `mutation CreateItem($boardId: ID!, $itemName: String!, $groupId: String!) {
      create_item(board_id: $boardId, item_name: $itemName, group_id: $groupId) {
        id
        name
      }
    }`
      : `mutation CreateItem($boardId: ID!, $itemName: String!) {
      create_item(board_id: $boardId, item_name: $itemName) {
        id
        name
      }
    }`,
    variables: {
      boardId: input.providerBoardId,
      itemName: input.itemName,
      ...(withGroup ? { groupId: input.groupId } : {}),
    },
  });
  const item = mondayRequireObject(data, "create_item", "create_item");
  const id = mondayProviderId(item) ?? "";
  if (!id) throw new Error("Monday create_item returned no id.");
  if (Object.keys(input.providerFields).length > 0) {
    try {
      await mondayLiveUpdateItem({
        providerConfigKey: input.providerConfigKey,
        connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
        providerBoardId: input.providerBoardId,
        providerItemId: id,
        providerFields: input.providerFields,
      });
    } catch (error) {
      const archiveResult = await mondayLiveArchiveItems({
        providerConfigKey: input.providerConfigKey,
        connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
        targets: [{ providerItemId: id }],
      }).catch((archiveError: unknown) => ({
        attempted: 1,
        failures: [
          {
            providerItemId: id,
            message: archiveError instanceof Error ? archiveError.message : String(archiveError),
          },
        ],
      }));
      const updateMessage = error instanceof Error ? error.message : String(error);
      const archiveMessage =
        archiveResult.failures.length === 0
          ? "The partially created Monday item was archived."
          : `Failed to archive the partially created Monday item: ${archiveResult.failures
              .map((failure) => failure.message)
              .join("; ")}`;
      throw new Error(`Monday item column values failed after creating item ${id}: ${updateMessage}. ${archiveMessage}`);
    }
  }
  return {
    id,
    name:
      typeof item["name"] === "string" ? item["name"] : item["name"] === null ? null : undefined,
  };
}

export async function mondayLiveUpdateItem(input: MondayLiveConnectionInput & {
  providerBoardId: string;
  providerItemId: string;
  providerFields: Record<string, unknown>;
}): Promise<{ id: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.item.update",
    publicSummary: "Monday change_multiple_column_values failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation UpdateItem($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues, create_labels_if_missing: false) {
        id
      }
    }`,
    variables: {
      boardId: input.providerBoardId,
      itemId: input.providerItemId,
      columnValues: JSON.stringify(input.providerFields),
    },
  });
  const item = mondayRequireObject(
    data,
    "change_multiple_column_values",
    "change_multiple_column_values",
  );
  return { id: mondayProviderId(item) ?? input.providerItemId };
}

export async function mondayLiveRenameItem(input: MondayLiveConnectionInput & {
  providerBoardId: string;
  providerItemId: string;
  itemName: string;
}): Promise<{ id: string; name: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.item.rename",
    publicSummary: "Monday name column update failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation RenameItem($boardId: ID!, $itemId: ID!, $name: String!) {
      change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: "name", value: $name) {
        id
        name
      }
    }`,
    variables: {
      boardId: input.providerBoardId,
      itemId: input.providerItemId,
      name: input.itemName,
    },
  });
  const item = mondayRequireObject(data, "change_simple_column_value", "change_simple_column_value");
  return {
    id: mondayProviderId(item) ?? input.providerItemId,
    name: typeof item["name"] === "string" ? item["name"] : input.itemName,
  };
}

export async function mondayLiveMoveItemToGroup(input: MondayLiveConnectionInput & {
  providerItemId: string;
  groupId: string;
}): Promise<{ id: string; groupId: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.item.move_to_group",
    publicSummary: "Monday move_item_to_group failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation MoveItemToGroup($itemId: ID!, $groupId: String!) {
      move_item_to_group(item_id: $itemId, group_id: $groupId) { id }
    }`,
    variables: {
      itemId: input.providerItemId,
      groupId: input.groupId,
    },
  });
  const item = mondayRequireObject(data, "move_item_to_group", "move_item_to_group");
  return { id: mondayProviderId(item) ?? input.providerItemId, groupId: input.groupId };
}

export async function mondayLiveArchiveItems(input: MondayLiveConnectionInput & {
  targets: readonly { providerItemId: string }[];
}): Promise<{ attempted: number; failures: Array<{ providerItemId: string; message: string }> }> {
  const failures: Array<{ providerItemId: string; message: string }> = [];
  for (const target of input.targets) {
    try {
      await mondayProxyGraphql({
        operation: "monday.item.archive",
        publicSummary: "Monday archive_item failed",
        providerConfigKey: input.providerConfigKey,
        connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
        query: `mutation Archive($itemId: ID!) { archive_item(item_id: $itemId) { id } }`,
        variables: { itemId: target.providerItemId },
      });
    } catch (error) {
      failures.push({
        providerItemId: target.providerItemId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (failures.length === input.targets.length) {
    throw new Error(
      `Monday archive failed for all items: ${failures.map((failure) => `${failure.providerItemId}: ${failure.message}`).join("; ")}`,
    );
  }
  return { attempted: input.targets.length, failures };
}

export async function mondayLiveCreateBoard(input: MondayLiveConnectionInput & {
  boardName: string;
  boardKind: "public" | "private" | "share";
  workspaceId?: string;
  description?: string;
  empty?: boolean;
}): Promise<{ boardId: string; name: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.board.create",
    publicSummary: "Monday create_board failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation CreateBoard($boardName: String!, $boardKind: BoardKind!, $workspaceId: ID, $description: String, $empty: Boolean) {
      create_board(board_name: $boardName, board_kind: $boardKind, workspace_id: $workspaceId, description: $description, empty: $empty) { id name }
    }`,
    variables: {
      boardName: input.boardName,
      boardKind: input.boardKind,
      workspaceId: input.workspaceId,
      description: input.description,
      empty: input.empty,
    },
  });
  const board = mondayRequireObject(data, "create_board", "create_board");
  const boardId = mondayProviderId(board);
  if (!boardId) throw new Error("Monday create_board returned no id.");
  return { boardId, name: typeof board["name"] === "string" ? board["name"] : input.boardName };
}

export async function mondayLiveRenameBoard(input: MondayLiveConnectionInput & {
  boardId: string;
  name: string;
}): Promise<void> {
  await mondayProxyGraphql({
    operation: "monday.board.rename",
    publicSummary: "Monday update_board failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation RenameBoard($boardId: ID!, $newName: String!) {
      update_board(board_id: $boardId, board_attribute: name, new_value: $newName)
    }`,
    variables: { boardId: input.boardId, newName: input.name },
  });
}

export async function mondayLiveDeleteBoard(input: MondayLiveConnectionInput & {
  boardId: string;
}): Promise<{ boardId: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.board.delete",
    publicSummary: "Monday delete_board failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation DeleteBoard($boardId: ID!) { delete_board(board_id: $boardId) { id } }`,
    variables: { boardId: input.boardId },
  });
  const board = mondayRequireObject(data, "delete_board", "delete_board");
  return { boardId: mondayProviderId(board) ?? input.boardId };
}

export async function mondayLiveCreateColumn(input: MondayLiveConnectionInput & {
  boardId: string;
  title: string;
  columnType: string;
  description?: string;
  afterColumnId?: string;
}): Promise<{ boardId: string; columnId: string; title: string; columnType: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.column.create",
    publicSummary: "Monday create_column failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation CreateColumn($boardId: ID!, $title: String!, $columnType: ColumnType!, $description: String, $afterColumnId: ID) {
      create_column(board_id: $boardId, title: $title, column_type: $columnType, description: $description, after_column_id: $afterColumnId) {
        id title type
      }
    }`,
    variables: {
      boardId: input.boardId,
      title: input.title,
      columnType: input.columnType,
      description: input.description,
      afterColumnId: input.afterColumnId,
    },
  });
  const column = mondayRequireObject(data, "create_column", "create_column");
  const columnId = mondayProviderId(column);
  if (!columnId) throw new Error("Monday create_column returned no id.");
  return {
    boardId: input.boardId,
    columnId,
    title: typeof column["title"] === "string" ? column["title"] : input.title,
    columnType: typeof column["type"] === "string" ? column["type"] : input.columnType,
  };
}

export async function mondayLiveRenameColumn(input: MondayLiveConnectionInput & {
  boardId: string;
  columnId: string;
  title: string;
}): Promise<{ boardId: string; columnId: string; title: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.column.rename",
    publicSummary: "Monday change_column_title failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation RenameColumn($boardId: ID!, $columnId: String!, $title: String!) {
      change_column_title(board_id: $boardId, column_id: $columnId, title: $title) { id title }
    }`,
    variables: input,
  });
  const column = mondayRequireObject(data, "change_column_title", "change_column_title");
  return {
    boardId: input.boardId,
    columnId: mondayProviderId(column) ?? input.columnId,
    title: typeof column["title"] === "string" ? column["title"] : input.title,
  };
}

export async function mondayLiveDeleteColumn(input: MondayLiveConnectionInput & {
  boardId: string;
  columnId: string;
}): Promise<{ boardId: string; columnId: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.column.delete",
    publicSummary: "Monday delete_column failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation DeleteColumn($boardId: ID!, $columnId: String!) {
      delete_column(board_id: $boardId, column_id: $columnId) { id }
    }`,
    variables: input,
  });
  const column = mondayRequireObject(data, "delete_column", "delete_column");
  return { boardId: input.boardId, columnId: mondayProviderId(column) ?? input.columnId };
}

export async function mondayLiveCreateGroup(input: MondayLiveConnectionInput & {
  boardId: string;
  groupName: string;
  relativeToGroupId?: string;
  positionRelativeMethod?: "before_at" | "after_at";
  groupColor?: string;
}): Promise<{ boardId: string; groupId: string; title: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.group.create",
    publicSummary: "Monday create_group failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation CreateGroup($boardId: ID!, $groupName: String!, $relativeTo: String, $positionRelativeMethod: PositionRelative, $groupColor: String) {
      create_group(board_id: $boardId, group_name: $groupName, relative_to: $relativeTo, position_relative_method: $positionRelativeMethod, group_color: $groupColor) {
        id title
      }
    }`,
    variables: {
      boardId: input.boardId,
      groupName: input.groupName,
      relativeTo: input.relativeToGroupId,
      positionRelativeMethod: input.positionRelativeMethod,
      groupColor: input.groupColor,
    },
  });
  const group = mondayRequireObject(data, "create_group", "create_group");
  const groupId = mondayProviderId(group);
  if (!groupId) throw new Error("Monday create_group returned no id.");
  return {
    boardId: input.boardId,
    groupId,
    title: typeof group["title"] === "string" ? group["title"] : input.groupName,
  };
}

export async function mondayLiveRenameGroup(input: MondayLiveConnectionInput & {
  boardId: string;
  groupId: string;
  title: string;
}): Promise<{ boardId: string; groupId: string; title: string }> {
  const data = await mondayProxyGraphql({
    operation: "monday.group.rename",
    publicSummary: "Monday update_group failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation RenameGroup($boardId: ID!, $groupId: String!, $title: String!) {
      update_group(board_id: $boardId, group_id: $groupId, group_attribute: title, new_value: $title) { id title }
    }`,
    variables: input,
  });
  const group = mondayRequireObject(data, "update_group", "update_group(title)");
  return {
    boardId: input.boardId,
    groupId: mondayProviderId(group) ?? input.groupId,
    title: typeof group["title"] === "string" ? group["title"] : input.title,
  };
}

export async function mondayLiveDeleteGroup(input: MondayLiveConnectionInput & {
  boardId: string;
  groupId: string;
}): Promise<{ boardId: string; groupId: string; deleted: boolean }> {
  const data = await mondayProxyGraphql({
    operation: "monday.group.delete",
    publicSummary: "Monday delete_group failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    query: `mutation DeleteGroup($boardId: ID!, $groupId: String!) {
      delete_group(board_id: $boardId, group_id: $groupId) { id deleted }
    }`,
    variables: input,
  });
  const group = mondayRequireObject(data, "delete_group", "delete_group");
  return {
    boardId: input.boardId,
    groupId: mondayProviderId(group) ?? input.groupId,
    deleted: group["deleted"] === true,
  };
}
