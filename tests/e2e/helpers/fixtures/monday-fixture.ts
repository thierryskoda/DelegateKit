import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { requireMondayNango } from "../../../../apps/backend/src/test-support/capabilities/monday";
import {
  mondayLiveDiscoverBoards,
  mondayLiveArchiveItems,
  mondayLiveCreateColumn,
  mondayLiveCreateItem,
  mondayLiveCreateSubitem,
  mondayLiveDeleteColumn,
  mondayLiveGetItem,
  type MondayLiveRawDiscoveryBoard,
} from "../../../../apps/backend/src/test-support/capabilities/monday";
import { mondayProviderId } from "../../../../apps/backend/src/test-support/capabilities/monday";
import type { E2eFixtureScope } from "./e2e-fixture-scope";
import { TESTING_FIXTURE_CLIENT } from "../test-data/testing-realistic-data";
import { requireSingleTestingNangoConnection } from "../readiness/testing-provider-readiness";
import {
  listProviderSandboxResources,
  upsertProviderSandboxResource,
  type ProviderSandboxBinding,
} from "../../../../apps/backend/src/test-support/provider-sandbox";
import { seedProviderSandboxOperationResponses } from "../provider-runtime/provider-sandbox-fixtures";
import { requireTestingProviderSandboxBinding } from "../provider-runtime/testing-provider-runtime";

const MONDAY_SANDBOX_BOARD_RESOURCE_TYPE = "monday_board";
const MONDAY_SANDBOX_ITEM_RESOURCE_TYPE = "monday_item";
const MONDAY_PROVIDER_KEY = "ai-assistants-monday";

export const TESTING_MONDAY_LEAD_BOARD_HINT = "client" as const;

export const TESTING_MONDAY_SEED_VALUES = {
  company: TESTING_FIXTURE_CLIENT.company.name,
  primaryContact: TESTING_FIXTURE_CLIENT.person.email,
  dealValue: TESTING_FIXTURE_CLIENT.deal.dealValue,
  stage: TESTING_FIXTURE_CLIENT.deal.stageLabel,
} as const;

export type TestingMondayColumnIds = {
  company: string;
  primaryContact: string;
  contactPhone?: string;
  dealValue: string;
  stage: string;
  contractLink?: string;
};

export type SeededMondayLeadFixture = {
  itemId: string;
  boardId: string;
  boardName: string;
  itemTitle: string;
  columnIds: TestingMondayColumnIds;
  columnValues: Record<string, unknown>;
  columnValuesById: Record<string, { text: string | null; type: string | null; value: unknown }>;
  providerConfigKey: string;
  connectionId: string;
};

export type SeededMondaySubitemFixture = {
  subitemId: string;
  parentItemId: string;
  itemName: string;
  providerConfigKey: string;
  connectionId: string;
};

export type SeededMondayColumnFixture = {
  boardId: string;
  columnId: string;
  title: string;
  columnType: string;
  providerConfigKey: string;
  connectionId: string;
};

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
  const labels = (settings as Record<string, unknown>).labels;
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

function columnMatches(title: string, needles: readonly string[]): boolean {
  const normalized = title.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function requireColumn(
  board: MondayLiveRawDiscoveryBoard,
  input: {
    logicalName: keyof TestingMondayColumnIds;
    titles: readonly string[];
    types: readonly string[];
  },
) {
  const column = (board.columns ?? []).find((candidate) => {
    const type = typeof candidate.type === "string" ? candidate.type : "";
    const title = typeof candidate.title === "string" ? candidate.title : "";
    return input.types.includes(type) && columnMatches(title, input.titles);
  });
  if (!column) return null;
  const columnId = typeof column.id === "string" && column.id.trim() ? column.id : null;
  const type = typeof column.type === "string" ? column.type : null;
  if (!columnId || !type) return null;
  return { columnId, type, settings: parseSettings(column.settings ?? column.settings_str) };
}

function valueForColumn(type: string, value: unknown): unknown {
  if (type === "email") return { email: String(value), text: String(value) };
  if (type === "phone") return { phone: String(value), countryShortName: "CA" };
  if (type === "status") return { label: String(value) };
  if (type === "dropdown") return { labels: [String(value)] };
  return value;
}

function discoverTestingBoard(boards: MondayLiveRawDiscoveryBoard[]) {
  for (const board of boards) {
    const company =
      requireColumn(board, {
        logicalName: "company",
        titles: ["company", "account"],
        types: ["text", "long_text"],
      }) ??
      requireColumn(board, {
        logicalName: "company",
        titles: ["client"],
        types: ["text", "long_text"],
      });
    const primaryContact = requireColumn(board, {
      logicalName: "primaryContact",
      titles: ["email", "contact"],
      types: ["email", "text", "long_text"],
    });
    const contactPhone = requireColumn(board, {
      logicalName: "contactPhone",
      titles: ["phone", "mobile", "cell"],
      types: ["phone"],
    });
    const dealValue = requireColumn(board, {
      logicalName: "dealValue",
      titles: ["value", "amount", "fee", "deal"],
      types: ["numbers"],
    });
    const stage = requireColumn(board, {
      logicalName: "stage",
      titles: ["stage", "status"],
      types: ["status", "dropdown"],
    });
    if (!company || !primaryContact || !dealValue || !stage) continue;
    const stageLabels = labelsFromSettings(stage.settings);
    if (stageLabels.length > 0 && !stageLabels.includes(TESTING_MONDAY_SEED_VALUES.stage)) {
      continue;
    }
    const boardId = mondayProviderId(board);
    if (!boardId) continue;
    return {
      boardId,
      boardName: typeof board.name === "string" ? board.name : "",
      columnIds: {
        company: company.columnId,
        primaryContact: primaryContact.columnId,
        ...(contactPhone ? { contactPhone: contactPhone.columnId } : {}),
        dealValue: dealValue.columnId,
        stage: stage.columnId,
      },
      columnTypes: {
        company: company.type,
        primaryContact: primaryContact.type,
        ...(contactPhone ? { contactPhone: contactPhone.type } : {}),
        dealValue: dealValue.type,
        stage: stage.type,
      },
    };
  }
  return null;
}

async function requireMondaySandboxBinding(db: SupabaseServiceClient): Promise<{
  binding: ProviderSandboxBinding;
  providerConfigKey: typeof MONDAY_PROVIDER_KEY;
  connectionId: string;
}> {
  const fixture = await requireTestingProviderSandboxBinding(db, {
    capabilitySlug: "monday",
    provider: "monday",
  });
  return {
    binding: {
      link: fixture.capabilityAccountLink,
      account: fixture.connectedAccount,
    },
    providerConfigKey: MONDAY_PROVIDER_KEY,
    connectionId: fixture.connectedAccount.id,
  };
}

function mondaySandboxBoard() {
  const columns = [
    { id: "company", title: "Company", type: "text", settings_str: null },
    { id: "primary_contact", title: "Primary Contact", type: "email", settings_str: null },
    { id: "contact_phone", title: "Contact Phone", type: "phone", settings_str: null },
    { id: "deal_value", title: "Deal Value", type: "numbers", settings_str: null },
    {
      id: "stage",
      title: "Stage",
      type: "status",
      settings_str: JSON.stringify({ labels: { "0": TESTING_MONDAY_SEED_VALUES.stage } }),
    },
    { id: "contract_link", title: "Contract Link", type: "link", settings_str: null },
  ];
  return {
    id: "sandbox-monday-client-board",
    name: "Client Mandates",
    columns,
    groups: [{ id: "active_clients", title: "Active Clients" }],
  };
}

function mondaySandboxColumnValue(input: { id: string; type: string; value: unknown }) {
  const text =
    typeof input.value === "string"
      ? input.value
      : input.value && typeof input.value === "object" && "text" in input.value
        ? String((input.value as { text?: unknown }).text ?? "")
        : input.value && typeof input.value === "object" && "email" in input.value
          ? String((input.value as { email?: unknown }).email ?? "")
          : input.value && typeof input.value === "object" && "phone" in input.value
            ? String((input.value as { phone?: unknown }).phone ?? "")
            : input.value && typeof input.value === "object" && "label" in input.value
              ? String((input.value as { label?: unknown }).label ?? "")
              : String(input.value ?? "");
  return {
    id: input.id,
    text,
    type: input.type,
    value: JSON.stringify(input.value),
  };
}

function mondaySandboxItem(input: {
  itemId: string;
  itemTitle: string;
  board: ReturnType<typeof mondaySandboxBoard>;
  columnValues: Record<string, unknown>;
}) {
  const columnTypes = Object.fromEntries(
    input.board.columns.map((column) => [column.id, column.type]),
  );
  return {
    id: input.itemId,
    name: input.itemTitle,
    state: "active",
    board: { id: input.board.id, name: input.board.name },
    group: { id: "active_clients", title: "Active Clients" },
    column_values: Object.entries(input.columnValues).map(([id, value]) =>
      mondaySandboxColumnValue({ id, type: columnTypes[id] ?? "text", value }),
    ),
  };
}

async function refreshMondaySandboxOperationFixtures(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerConfigKey: typeof MONDAY_PROVIDER_KEY;
}): Promise<void> {
  const boardResources = await listProviderSandboxResources({
    db: input.db,
    binding: input.binding,
    providerKey: input.providerConfigKey,
    resourceType: MONDAY_SANDBOX_BOARD_RESOURCE_TYPE,
  });
  const itemResources = await listProviderSandboxResources({
    db: input.db,
    binding: input.binding,
    providerKey: input.providerConfigKey,
    resourceType: MONDAY_SANDBOX_ITEM_RESOURCE_TYPE,
  });
  const boards = boardResources.map((resource) => resource.state);
  const items = itemResources.map((resource) => resource.state);
  await seedProviderSandboxOperationResponses({
    db: input.db,
    binding: input.binding,
    fixtures: [
      {
        providerKey: input.providerConfigKey,
        operation: "monday.discovery",
        response: { data: { boards } },
      },
      {
        providerKey: input.providerConfigKey,
        operation: "monday.item.list",
        response: { data: { boards: [{ items_page: { cursor: null, items } }] } },
      },
      {
        providerKey: input.providerConfigKey,
        operation: "monday.item.get",
        response: { data: { items } },
      },
      {
        providerKey: input.providerConfigKey,
        operation: "monday.subitem.list",
        response: { data: { items: [] } },
      },
      {
        providerKey: input.providerConfigKey,
        operation: "monday.update.list",
        response: { data: { updates: [] } },
      },
    ],
  });
}

export async function seedMondayEmptyDiscoverySandboxForE2e(
  db: SupabaseServiceClient,
): Promise<void> {
  const { binding, providerConfigKey } = await requireMondaySandboxBinding(db);
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey: providerConfigKey,
        operation: "monday.discovery",
        response: { data: { boards: [] } },
      },
      {
        providerKey: providerConfigKey,
        operation: "monday.item.list",
        response: { data: { boards: [{ items_page: { cursor: null, items: [] } }] } },
      },
      {
        providerKey: providerConfigKey,
        operation: "monday.item.get",
        response: { data: { items: [] } },
      },
      {
        providerKey: providerConfigKey,
        operation: "monday.subitem.list",
        response: { data: { items: [] } },
      },
      {
        providerKey: providerConfigKey,
        operation: "monday.update.list",
        response: { data: { updates: [] } },
      },
    ],
  });
}

export async function seedMondayUpdateCreateSandboxForE2e(
  db: SupabaseServiceClient,
  input?: { updateId?: string },
): Promise<{ updateId: string }> {
  const { binding, providerConfigKey } = await requireMondaySandboxBinding(db);
  const updateId = input?.updateId ?? `sandbox-monday-update-${Date.now()}`;
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey: providerConfigKey,
        operation: "monday.update.create",
        response: {
          data: {
            create_update: {
              id: updateId,
              body: "Marc called. He is waiting on the signed mandate before sending the missing bank document.",
              text_body:
                "Marc called. He is waiting on the signed mandate before sending the missing bank document.",
              created_at: new Date().toISOString(),
              creator: { id: "testing-john-tremblay", name: "John Tremblay" },
            },
          },
        },
      },
    ],
  });
  return { updateId };
}

export async function seedMondayItemUpdateSandboxForE2e(
  db: SupabaseServiceClient,
  input: { itemId: string },
): Promise<void> {
  const { binding, providerConfigKey } = await requireMondaySandboxBinding(db);
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey: providerConfigKey,
        operation: "monday.item.update",
        response: {
          data: {
            change_multiple_column_values: {
              id: input.itemId,
            },
          },
        },
      },
    ],
  });
}

export async function loadMondaySandboxItemForE2e(
  db: SupabaseServiceClient,
  input: Pick<SeededMondayLeadFixture, "itemId" | "providerConfigKey">,
): Promise<Record<string, unknown>> {
  const { binding } = await requireMondaySandboxBinding(db);
  const resources = await listProviderSandboxResources({
    db,
    binding,
    providerKey: input.providerConfigKey,
    resourceType: MONDAY_SANDBOX_ITEM_RESOURCE_TYPE,
  });
  const resource = resources.find((candidate) => candidate.resource_id === input.itemId);
  if (
    !resource ||
    !resource.state ||
    typeof resource.state !== "object" ||
    Array.isArray(resource.state)
  ) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Testing Monday sandbox item ${input.itemId} was not found.`,
    );
  }
  return resource.state as Record<string, unknown>;
}

export function requireMondaySandboxColumnEvidence(
  item: Record<string, unknown>,
  columnId: string,
): string {
  const columns = Array.isArray(item.column_values) ? item.column_values : [];
  const column = columns.find((candidate) => {
    return (
      candidate !== null &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      String((candidate as Record<string, unknown>).id ?? "") === columnId
    );
  });
  if (!column || typeof column !== "object" || Array.isArray(column)) {
    throw new Error(`Monday sandbox item should include column ${columnId}.`);
  }
  const record = column as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (text) return text;
  const value = record.value;
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

export async function seedMondaySandboxLeadFixtureForE2e(
  db: SupabaseServiceClient,
  input: {
    itemTitle: string;
    contactPhone?: string;
    columnValueOverrides?: Record<string, unknown>;
  },
): Promise<SeededMondayLeadFixture> {
  const { binding, providerConfigKey, connectionId } = await requireMondaySandboxBinding(db);
  const board = mondaySandboxBoard();
  const itemId = `sandbox-monday-item-${Date.now()}`;
  const columnIds = {
    company: "company",
    primaryContact: "primary_contact",
    contactPhone: "contact_phone",
    dealValue: "deal_value",
    stage: "stage",
    contractLink: "contract_link",
  } satisfies TestingMondayColumnIds;
  const columnValues = {
    [columnIds.company]: valueForColumn("text", TESTING_MONDAY_SEED_VALUES.company),
    [columnIds.primaryContact]: valueForColumn("email", TESTING_MONDAY_SEED_VALUES.primaryContact),
    ...(input.contactPhone
      ? { [columnIds.contactPhone]: valueForColumn("phone", input.contactPhone) }
      : {}),
    [columnIds.dealValue]: valueForColumn("numbers", TESTING_MONDAY_SEED_VALUES.dealValue),
    [columnIds.stage]: valueForColumn("status", TESTING_MONDAY_SEED_VALUES.stage),
    [columnIds.contractLink]: valueForColumn("link", ""),
    ...(input.columnValueOverrides ?? {}),
  };
  const item = mondaySandboxItem({
    itemId,
    itemTitle: input.itemTitle,
    board,
    columnValues,
  });
  await upsertProviderSandboxResource({
    db,
    binding,
    key: {
      providerKey: providerConfigKey,
      resourceType: MONDAY_SANDBOX_BOARD_RESOURCE_TYPE,
      resourceId: board.id,
    },
    state: board,
    metadata: { boardName: board.name },
  });
  await upsertProviderSandboxResource({
    db,
    binding,
    key: {
      providerKey: providerConfigKey,
      resourceType: MONDAY_SANDBOX_ITEM_RESOURCE_TYPE,
      resourceId: itemId,
    },
    state: item,
    metadata: { itemTitle: input.itemTitle },
  });
  await refreshMondaySandboxOperationFixtures({
    db,
    binding,
    providerConfigKey,
  });
  return {
    itemId,
    boardId: board.id,
    boardName: board.name,
    itemTitle: input.itemTitle,
    columnIds,
    columnValues,
    columnValuesById: Object.fromEntries(
      item.column_values.map((column) => [
        column.id,
        { text: column.text, type: column.type, value: parseSettings(column.value) },
      ]),
    ),
    providerConfigKey,
    connectionId,
  };
}

export async function seedMondayLeadForE2e(
  scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  input: {
    itemTitle: string;
    profileId?: string;
    contactPhone?: string;
    columnValueOverrides?: Record<string, unknown>;
  },
): Promise<SeededMondayLeadFixture> {
  const profileId = input.profileId ?? "testing";

  await requireSingleTestingNangoConnection(db, {
    capabilitySlug: "monday",
    provider: "monday",
    label: "Monday",
    requiredOAuthScopes: ["boards:read", "boards:write"],
  });

  const binding = await requireMondayNango(db, profileId);
  const discovery = await mondayLiveDiscoverBoards({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    boardLimit: 100,
    sampleItemsPerBoard: 0,
  });
  const board = discoverTestingBoard(discovery.boards);
  if (!board) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Testing Monday setup needs a live board with company, contact/email, deal value, and stage/status columns. Update the testing Monday board instead of creating schema inside normal E2Es.",
    );
  }

  const columnValues = {
    [board.columnIds.company]: valueForColumn(
      board.columnTypes.company,
      TESTING_MONDAY_SEED_VALUES.company,
    ),
    [board.columnIds.primaryContact]: valueForColumn(
      board.columnTypes.primaryContact,
      TESTING_MONDAY_SEED_VALUES.primaryContact,
    ),
    ...(input.contactPhone && board.columnIds.contactPhone && board.columnTypes.contactPhone
      ? {
          [board.columnIds.contactPhone]: valueForColumn(
            board.columnTypes.contactPhone,
            input.contactPhone,
          ),
        }
      : {}),
    [board.columnIds.dealValue]: valueForColumn(
      board.columnTypes.dealValue,
      TESTING_MONDAY_SEED_VALUES.dealValue,
    ),
    [board.columnIds.stage]: valueForColumn(
      board.columnTypes.stage,
      TESTING_MONDAY_SEED_VALUES.stage,
    ),
    ...(input.columnValueOverrides ?? {}),
  };

  if (input.contactPhone && !board.columnIds.contactPhone) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Testing Monday setup needs a live phone column to seed contact-phone conflict scenarios.",
    );
  }

  const created = await mondayLiveCreateItem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    providerBoardId: board.boardId,
    itemName: input.itemTitle,
    providerFields: columnValues,
  });

  scope.add({
    label: `monday:item:${board.boardId}:${created.id}`,
    resource: {
      kind: "monday.item",
      providerConfigKey: binding.nangoProviderConfigKey,
      connectionId: binding.nangoConnectionId,
      boardId: board.boardId,
      itemId: created.id,
      label: `monday:item:${board.boardId}:${created.id}`,
    },
    cleanup: async () => {
      await mondayLiveArchiveItems({
        providerConfigKey: binding.nangoProviderConfigKey,
        connectionId: binding.nangoConnectionId,
        targets: [{ providerItemId: created.id }],
      });
    },
  });

  const hydrated = await mondayLiveGetItem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    providerItemId: created.id,
  });
  if (!hydrated) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Created Monday item ${created.id} was not found.`,
    );
  }

  return {
    itemId: created.id,
    boardId: board.boardId,
    boardName: board.boardName,
    itemTitle: input.itemTitle,
    columnIds: board.columnIds,
    columnValues,
    columnValuesById: Object.fromEntries(
      hydrated.columnValues.map((column) => [
        column.id,
        { text: column.text, type: column.type, value: column.value },
      ]),
    ),
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
  };
}

export async function seedMondaySubitemsForE2e(
  scope: E2eFixtureScope,
  _db: SupabaseServiceClient,
  parent: Pick<SeededMondayLeadFixture, "itemId" | "providerConfigKey" | "connectionId">,
  itemNames: readonly string[],
): Promise<SeededMondaySubitemFixture[]> {
  const fixtures: SeededMondaySubitemFixture[] = [];
  for (const itemName of itemNames) {
    const created = await mondayLiveCreateSubitem({
      providerConfigKey: parent.providerConfigKey,
      connectionId: parent.connectionId,
      parentItemId: parent.itemId,
      itemName,
      providerFields: {},
    });

    scope.add({
      label: `monday:subitem:${parent.itemId}:${created.id}`,
      resource: {
        kind: "monday.subitem",
        providerConfigKey: parent.providerConfigKey,
        connectionId: parent.connectionId,
        parentItemId: parent.itemId,
        subitemId: created.id,
        label: `monday:subitem:${parent.itemId}:${created.id}`,
      },
      cleanup: async () => {
        await mondayLiveArchiveItems({
          providerConfigKey: parent.providerConfigKey,
          connectionId: parent.connectionId,
          targets: [{ providerItemId: created.id }],
        });
      },
    });

    fixtures.push({
      subitemId: created.id,
      parentItemId: parent.itemId,
      itemName,
      providerConfigKey: parent.providerConfigKey,
      connectionId: parent.connectionId,
    });
  }
  return fixtures;
}

export async function seedMondaySandboxSubitemsFixtureForE2e(
  db: SupabaseServiceClient,
  parent: Pick<SeededMondayLeadFixture, "itemId" | "providerConfigKey" | "connectionId">,
  itemNames: readonly string[],
): Promise<SeededMondaySubitemFixture[]> {
  const { binding, providerConfigKey, connectionId } = await requireMondaySandboxBinding(db);
  if (providerConfigKey !== parent.providerConfigKey || connectionId !== parent.connectionId) {
    throw new Error("Testing Monday sandbox subitems must use the seeded parent binding.");
  }
  const itemResources = await listProviderSandboxResources({
    db,
    binding,
    providerKey: providerConfigKey,
    resourceType: MONDAY_SANDBOX_ITEM_RESOURCE_TYPE,
  });
  const parentResource = itemResources.find(
    (resource) =>
      resource.resource_id === parent.itemId &&
      resource.state &&
      typeof resource.state === "object" &&
      !Array.isArray(resource.state),
  );
  if (!parentResource) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Testing Monday sandbox parent item ${parent.itemId} was not found.`,
    );
  }
  const parentState = parentResource.state as Record<string, unknown>;
  const board =
    parentState.board && typeof parentState.board === "object" && !Array.isArray(parentState.board)
      ? (parentState.board as Record<string, unknown>)
      : { id: "sandbox-monday-subitems-board", name: "Subitems" };
  const group =
    parentState.group && typeof parentState.group === "object" && !Array.isArray(parentState.group)
      ? (parentState.group as Record<string, unknown>)
      : { id: "active_clients", title: "Active Clients" };
  const subitems = itemNames.map((itemName, index) => ({
    id: `${parent.itemId}-subitem-${index + 1}`,
    name: itemName,
    state: "active",
    board,
    group,
    column_values: [],
  }));
  const parentWithSubitems = {
    ...parentState,
    subitems,
  };
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey: providerConfigKey,
        operation: "monday.subitem.list",
        response: { data: { items: [parentWithSubitems] } },
      },
    ],
  });
  return subitems.map((subitem) => ({
    subitemId: subitem.id,
    parentItemId: parent.itemId,
    itemName: subitem.name,
    providerConfigKey,
    connectionId,
  }));
}

export async function seedMondaySandboxColumnFixtureForE2e(
  db: SupabaseServiceClient,
  parent: Pick<SeededMondayLeadFixture, "boardId" | "providerConfigKey" | "connectionId">,
  input: {
    title: string;
    columnType: string;
    description?: string;
    afterColumnId?: string;
  },
): Promise<SeededMondayColumnFixture> {
  const { binding, providerConfigKey, connectionId } = await requireMondaySandboxBinding(db);
  if (providerConfigKey !== parent.providerConfigKey || connectionId !== parent.connectionId) {
    throw new Error("Testing Monday sandbox columns must use the seeded parent binding.");
  }
  const boardResources = await listProviderSandboxResources({
    db,
    binding,
    providerKey: providerConfigKey,
    resourceType: MONDAY_SANDBOX_BOARD_RESOURCE_TYPE,
  });
  const boardResource = boardResources.find(
    (resource) =>
      resource.resource_id === parent.boardId &&
      resource.state &&
      typeof resource.state === "object" &&
      !Array.isArray(resource.state),
  );
  if (!boardResource) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Testing Monday sandbox board ${parent.boardId} was not found.`,
    );
  }
  const board = boardResource.state as ReturnType<typeof mondaySandboxBoard>;
  const columnId = `sandbox_${input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  const nextBoard = {
    ...board,
    columns: [
      ...(Array.isArray(board.columns) ? board.columns : []),
      {
        id: columnId,
        title: input.title,
        type: input.columnType,
        settings_str: null,
      },
    ],
  };
  await upsertProviderSandboxResource({
    db,
    binding,
    key: {
      providerKey: providerConfigKey,
      resourceType: MONDAY_SANDBOX_BOARD_RESOURCE_TYPE,
      resourceId: parent.boardId,
    },
    state: nextBoard,
    metadata: { boardName: nextBoard.name },
  });
  await refreshMondaySandboxOperationFixtures({
    db,
    binding,
    providerConfigKey,
  });
  return {
    boardId: parent.boardId,
    columnId,
    title: input.title,
    columnType: input.columnType,
    providerConfigKey,
    connectionId,
  };
}

export async function seedMondayColumnForE2e(
  scope: E2eFixtureScope,
  _db: SupabaseServiceClient,
  parent: Pick<SeededMondayLeadFixture, "boardId" | "providerConfigKey" | "connectionId">,
  input: {
    title: string;
    columnType: string;
    description?: string;
    afterColumnId?: string;
  },
): Promise<SeededMondayColumnFixture> {
  const created = await mondayLiveCreateColumn({
    providerConfigKey: parent.providerConfigKey,
    connectionId: parent.connectionId,
    boardId: parent.boardId,
    title: input.title,
    columnType: input.columnType,
    ...(input.description ? { description: input.description } : {}),
    ...(input.afterColumnId ? { afterColumnId: input.afterColumnId } : {}),
  });

  scope.add({
    label: `monday:column:${parent.boardId}:${created.columnId}`,
    resource: {
      kind: "monday.column",
      providerConfigKey: parent.providerConfigKey,
      connectionId: parent.connectionId,
      boardId: parent.boardId,
      columnId: created.columnId,
      title: created.title,
      label: `monday:column:${parent.boardId}:${created.columnId}`,
    },
    cleanup: async () => {
      await mondayLiveDeleteColumn({
        providerConfigKey: parent.providerConfigKey,
        connectionId: parent.connectionId,
        boardId: parent.boardId,
        columnId: created.columnId,
      });
    },
  });

  return {
    boardId: parent.boardId,
    columnId: created.columnId,
    title: created.title,
    columnType: created.columnType,
    providerConfigKey: parent.providerConfigKey,
    connectionId: parent.connectionId,
  };
}
