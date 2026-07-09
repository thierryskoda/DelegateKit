import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { requireMondayNango } from "./connection";
import {
  mondayLiveDiscoverBoards,
  mondayLiveGetBoard,
  mondayLiveGetItem,
  mondayLiveListItems,
  mondayLiveListItemUpdates,
  mondayLiveListSubitems,
  mondayLiveListWorkspaces,
  type MondayLiveItem,
  type MondayLiveRawDiscoveryBoard,
} from "./live-graphql";
import { mondayProviderId } from "./graphql-proxy";
import type { NangoProxySandboxContext } from "../../integrations/nango/nango-proxy-client";

type MondayColumnValueHint = {
  columnType: string;
  valueShape: string;
  example: unknown;
};

type MondayItemFilter = {
  columnId: string;
  compareValue: unknown[];
  operator?: string | undefined;
  compareAttribute?: string | undefined;
};

type MondayItemOrderBy = {
  columnId: string;
  direction?: "asc" | "desc" | undefined;
};

const MONDAY_FILTERED_ITEM_SCAN_PAGE_SIZE = 100;
const MONDAY_FILTERED_ITEM_SCAN_MAX_PAGES = 10;

const MONDAY_COLUMN_VALUE_HINTS: MondayColumnValueHint[] = [
  { columnType: "text", valueShape: "string", example: "Acme Renovations" },
  { columnType: "long_text", valueShape: "string", example: "Client asked for a June follow-up." },
  { columnType: "numbers", valueShape: "number or numeric string", example: 15000 },
  { columnType: "date", valueShape: '{ "date": "YYYY-MM-DD" }', example: { date: "2026-06-30" } },
  { columnType: "email", valueShape: '{ "email": "...", "text": "..." }', example: { email: "client@acme.ca", text: "client@acme.ca" } },
  { columnType: "phone", valueShape: '{ "phone": "...", "countryShortName": "CA" }', example: { phone: "+15145550144", countryShortName: "CA" } },
  { columnType: "status", valueShape: '{ "label": "Label from monday_board_get" }', example: { label: "New" } },
  { columnType: "dropdown", valueShape: '{ "labels": ["Label from monday_board_get"] }', example: { labels: ["Qualified"] } },
  { columnType: "link", valueShape: '{ "url": "https://...", "text": "..." }', example: { url: "https://acme.ca", text: "Acme" } },
];

function hintForColumnType(columnType: string | null | undefined): MondayColumnValueHint | null {
  if (!columnType) return null;
  return MONDAY_COLUMN_VALUE_HINTS.find((hint) => hint.columnType === columnType) ?? null;
}

function parseSettings(raw: unknown): unknown {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function labelsFromSettings(settings: unknown): string[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return [];
  const record = settings as Record<string, unknown>;
  const labels = record.labels;
  if (Array.isArray(labels)) {
    return labels.flatMap((label) => (typeof label === "string" && label.trim() ? [label] : []));
  }
  if (labels && typeof labels === "object" && !Array.isArray(labels)) {
    return Object.values(labels).flatMap((label) =>
      typeof label === "string" && label.trim() ? [label] : [],
    );
  }
  return [];
}

function boardOutput(board: MondayLiveRawDiscoveryBoard) {
  const boardId = mondayProviderId(board);
  if (!boardId) {
    throw new DomainError(domainCodes.INTERNAL, "Monday returned a board without an id.");
  }
  return {
    boardId,
    name: typeof board.name === "string" ? board.name : "",
    columns: (board.columns ?? []).flatMap((column) => {
      const columnId = typeof column.id === "string" && column.id.trim() ? column.id : null;
      const type = typeof column.type === "string" && column.type.trim() ? column.type : null;
      if (!columnId || !type) return [];
      const settingsRaw = typeof column.settings_str === "string" ? column.settings_str : null;
      const settings = parseSettings(column.settings ?? settingsRaw);
      return [
        {
          columnId,
          title: typeof column.title === "string" ? column.title : "",
          type,
          settings,
          settingsRaw,
          labels: labelsFromSettings(settings),
          valueHint: hintForColumnType(type),
        },
      ];
    }),
    groups: (board.groups ?? []).flatMap((group) => {
      const groupId = mondayProviderId(group);
      if (!groupId) return [];
      return [{ groupId, title: typeof group.title === "string" ? group.title : "" }];
    }),
  };
}

function itemOutput(item: MondayLiveItem) {
  return {
    itemId: item.id,
    name: item.name,
    state: item.state,
    boardId: item.boardId,
    boardName: item.boardName,
    groupId: item.groupId,
    groupTitle: item.groupTitle,
    columnValuesById: Object.fromEntries(
      item.columnValues.map((column) => [
        column.id,
        { text: column.text, type: column.type, value: column.value },
      ]),
    ),
  };
}

function mondayItemMatchesFilter(
  item: MondayLiveItem,
  input: { groupId?: string; titleContains?: string },
): boolean {
  if (input.groupId && item.groupId !== input.groupId) return false;
  const needle = input.titleContains?.trim().toLowerCase();
  if (needle && !(item.name ?? "").toLowerCase().includes(needle)) return false;
  return true;
}

function hasLocalItemListFilter(input: { groupId?: string; titleContains?: string }): boolean {
  return Boolean(input.groupId || input.titleContains?.trim());
}

function mondayItemsQueryParams(input: {
  filters?: MondayItemFilter[];
  filtersOperator?: "and" | "or";
  orderBy?: MondayItemOrderBy[];
}): Record<string, unknown> | null {
  const queryParams: Record<string, unknown> = {};
  if (input.filters?.length) {
    queryParams.rules = input.filters.map((filter) => ({
      column_id: filter.columnId,
      compare_value: filter.compareValue,
      ...(filter.operator === undefined ? {} : { operator: filter.operator }),
      ...(filter.compareAttribute === undefined ? {} : { compare_attribute: filter.compareAttribute }),
    }));
    queryParams.operator = input.filtersOperator ?? "and";
  }
  if (input.orderBy?.length) {
    queryParams.order_by = input.orderBy.map((order) => ({
      column_id: order.columnId,
      ...(order.direction === undefined ? {} : { direction: order.direction }),
    }));
  }
  return Object.keys(queryParams).length > 0 ? queryParams : null;
}

async function assertMondayItemListQueryColumns(input: {
  providerConfigKey: string;
  connectionId: string;
  boardId: string;
  filters?: MondayItemFilter[];
  orderBy?: MondayItemOrderBy[];
  groupId?: string;
  sandbox?: NangoProxySandboxContext;
}) {
  if (!input.filters?.length && !input.orderBy?.length && !input.groupId) return;
  const board = await mondayLiveGetBoard({
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
    providerBoardId: input.boardId,
  });
  if (!board) {
    throw new DomainError(domainCodes.NOT_FOUND, `Monday board ${input.boardId} was not found.`);
  }
  const output = boardOutput(board);
  const columnIds = new Set(output.columns.map((column) => column.columnId));
  const unknownFilter = input.filters?.find((filter) => !columnIds.has(filter.columnId));
  if (unknownFilter) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Unknown Monday filter column id ${unknownFilter.columnId} for board ${input.boardId}.`,
    );
  }
  const unknownSort = input.orderBy?.find((order) => !columnIds.has(order.columnId));
  if (unknownSort) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Unknown Monday orderBy column id ${unknownSort.columnId} for board ${input.boardId}.`,
    );
  }
  if (input.groupId && !output.groups.some((group) => group.groupId === input.groupId)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Unknown Monday group id ${input.groupId} for board ${input.boardId}.`,
    );
  }
}

async function mondayBinding(db: SupabaseServiceClient, profileId: string) {
  return requireMondayNango(db, profileId);
}

export async function mondayWorkspaceList(input: { db: SupabaseServiceClient; profileId: string }) {
  const binding = await mondayBinding(input.db, input.profileId);
  const workspaces = await mondayLiveListWorkspaces({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
  });
  return { workspaces };
}

export async function mondayBoardList(input: {
  db: SupabaseServiceClient;
  profileId: string;
  nameContains?: string;
  limit?: number;
}) {
  const binding = await mondayBinding(input.db, input.profileId);
  const needle = input.nameContains?.trim().toLowerCase();
  const result = await mondayLiveDiscoverBoards({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
    boardLimit: input.limit ?? 100,
    sampleItemsPerBoard: 0,
  });
  const boards = result.boards
    .map(boardOutput)
    .filter((board) => (needle ? board.name.toLowerCase().includes(needle) : true))
    .slice(0, input.limit ?? 100)
    .map((board) => ({
      boardId: board.boardId,
      name: board.name,
      columns: board.columns.map((column) => ({
        columnId: column.columnId,
        title: column.title,
        type: column.type,
      })),
      groups: board.groups,
    }));
  return { boards };
}

export async function mondayBoardGet(input: {
  db: SupabaseServiceClient;
  profileId: string;
  boardId: string;
}) {
  const binding = await mondayBinding(input.db, input.profileId);
  const board = await mondayLiveGetBoard({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
    providerBoardId: input.boardId,
  });
  if (!board) {
    throw new DomainError(domainCodes.NOT_FOUND, `Monday board ${input.boardId} was not found.`);
  }
  return { board: boardOutput(board) };
}

export function mondayColumnTypeList() {
  return { columnTypes: MONDAY_COLUMN_VALUE_HINTS };
}

export async function mondayItemList(input: {
  db: SupabaseServiceClient;
  profileId: string;
  boardId: string;
  groupId?: string;
  titleContains?: string;
  filters?: MondayItemFilter[];
  filtersOperator?: "and" | "or";
  orderBy?: MondayItemOrderBy[];
  limit?: number;
  cursor?: string;
}) {
  const binding = await mondayBinding(input.db, input.profileId);
  const requestedLimit = input.limit ?? 50;
  const hasLocalFilter = hasLocalItemListFilter(input);
  const queryParams = mondayItemsQueryParams(input);
  if (input.cursor && (hasLocalFilter || queryParams)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Monday item list cursor cannot be combined with filters, orderBy, titleContains, or groupId.",
    );
  }
  await assertMondayItemListQueryColumns({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
    boardId: input.boardId,
    ...(input.filters === undefined ? {} : { filters: input.filters }),
    ...(input.orderBy === undefined ? {} : { orderBy: input.orderBy }),
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
  });
  if (hasLocalFilter && input.cursor === undefined) {
    const items: MondayLiveItem[] = [];
    let cursor: string | undefined;
    for (let pageIndex = 0; pageIndex < MONDAY_FILTERED_ITEM_SCAN_MAX_PAGES; pageIndex += 1) {
      const page = await mondayLiveListItems({
        providerConfigKey: binding.nangoProviderConfigKey,
        connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
        providerBoardId: input.boardId,
        limit: MONDAY_FILTERED_ITEM_SCAN_PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor }),
        ...(queryParams === null ? {} : { queryParams }),
      });
      for (const item of page.items) {
        if (mondayItemMatchesFilter(item, input)) items.push(item);
      }
      if (!page.cursor) break;
      cursor = page.cursor;
    }
    return {
      boardId: input.boardId,
      items: items.slice(0, requestedLimit).map(itemOutput),
      nextCursor: null,
    };
  }

  const page = await mondayLiveListItems({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
    providerBoardId: input.boardId,
    limit: requestedLimit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(queryParams === null ? {} : { queryParams }),
  });
  const items = page.items
    .filter((item) => mondayItemMatchesFilter(item, input))
    .map(itemOutput);
  return { boardId: input.boardId, items, nextCursor: page.cursor };
}

export async function mondayItemGet(input: {
  db: SupabaseServiceClient;
  profileId: string;
  itemId: string;
}) {
  const binding = await mondayBinding(input.db, input.profileId);
  const item = await mondayLiveGetItem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
    providerItemId: input.itemId,
  });
  if (!item) {
    throw new DomainError(domainCodes.NOT_FOUND, `Monday item ${input.itemId} was not found.`);
  }
  return { item: itemOutput(item) };
}

export async function mondaySubitemList(input: {
  db: SupabaseServiceClient;
  profileId: string;
  parentItemId: string;
  limit?: number;
}) {
  const binding = await mondayBinding(input.db, input.profileId);
  const result = await mondayLiveListSubitems({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
    parentItemId: input.parentItemId,
    limit: input.limit ?? 50,
  });
  return {
    parentItem: itemOutput(result.parentItem),
    subitems: result.subitems.map(itemOutput),
  };
}

export async function mondayUpdateList(input: {
  db: SupabaseServiceClient;
  profileId: string;
  itemId: string;
  includeReplies?: boolean;
  page?: number;
  limit?: number;
}) {
  const binding = await mondayBinding(input.db, input.profileId);
  const item = await mondayLiveGetItem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
    providerItemId: input.itemId,
  });
  if (!item) {
    throw new DomainError(domainCodes.NOT_FOUND, `Monday item ${input.itemId} was not found.`);
  }
  return mondayLiveListItemUpdates({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: input.db, binding },
    providerItemId: input.itemId,
    includeReplies: input.includeReplies ?? false,
    page: input.page ?? 1,
    limit: input.limit ?? 25,
  });
}
