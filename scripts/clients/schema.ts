import { z } from "zod";
import {
  profileCapabilitySlugSchema,
  capabilityProviderIdSchema,
  profileCapabilitySpec,
  slugProviderPairSchema,
} from "@ai-assistants/capability-catalog";
import { runtimeProfileSchema as repoRuntimeProfileSchema } from "@ai-assistants/repo-layout";
import { assistantScheduleSchema } from "@ai-assistants/scheduled-tasks-contracts/schemas";
import {
  writePolicyModeSchema,
  externalActionTypeSchema,
  providerAssistantWorkEventTypeSchema,
} from "@ai-assistants/tool-contracts";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

const profileIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers, and hyphens only.")
  .describe(
    "Stable lowercase profile id used in backend rows, runtime config, and workspace paths.",
  );

const nonEmptyStringSchema = z.string().trim().min(1);
const clientRuntimeProfileSchema = repoRuntimeProfileSchema.describe(
  "Runtime profile where this client should be included for backend runtime validation.",
);

const capabilityObjectSchema = z
  .object({
    slug: profileCapabilitySlugSchema.describe(
      "Profile capability slug from the capability catalog.",
    ),
    provider: capabilityProviderIdSchema
      .describe(
        "Capability account provider id, usually the catalog default for this capability (for example gmail, outlook-mail, outlook-calendar, microsoft-onedrive, or microsoft-sharepoint). When omitted, client seeding uses the catalog default provider.",
      )
      .optional(),
    label: nonEmptyStringSchema
      .describe("Connect-facing capability label. Defaults to the catalog label.")
      .optional(),
    required: z
      .boolean()
      .default(true)
      .describe("Whether this capability is expected for the launched assistant."),
    status: z
      .enum(["enabled", "disabled"])
      .describe("Initial backend capability status.")
      .optional(),
    config: jsonObjectSchema
      .default({})
      .describe("Provider-specific non-secret configuration stored with the capability instance."),
  })
  .strict()
  .describe("Expanded capability seed when slug-only shorthand is not enough.");

const clientCapabilitySchema = z
  .union([profileCapabilitySlugSchema, capabilityObjectSchema])
  .transform((value) => {
    if (typeof value !== "string") return value;
    return {
      slug: value,
      required: true,
      config: {},
    };
  })
  .describe("Capability slug shorthand or expanded capability object.");

const channelProviderSchema = z.enum(["telegram", "imessage"]);

const clientChannelSchema = z
  .object({
    provider: channelProviderSchema.describe("Mobile channel provider for direct client routing."),
    externalIdentity: nonEmptyStringSchema.describe(
      "Sender identity for this profile, such as a Telegram user id or iMessage handle.",
    ),
    accountId: nonEmptyStringSchema.describe(
      "Channel account id when more than one bot/account exists.",
    ),
    status: z
      .enum(["active", "inactive"])
      .describe("Whether this channel identity should be routable."),
    deliveryConfig: jsonObjectSchema.describe(
      "Channel-specific delivery settings. Secrets do not belong here.",
    ),
  })
  .strict()
  .describe("Direct channel identity that must resolve to exactly one profile.");

const clientWritePolicySchema = z
  .object({
    defaultMode: writePolicyModeSchema
      .default("auto_execute")
      .describe(
        "Fallback write policy mode for policy-controlled external write actions without an explicit override.",
      ),
    actions: z
      .partialRecord(externalActionTypeSchema, writePolicyModeSchema)
      .default({})
      .describe("Overrides for write policy modes keyed by canonical external action id."),
  })
  .strict()
  .describe("Per-profile write policy overrides layered on top of capability defaults.");

const assistantWorkRouteConfigSchema = z
  .object({
    instructions: z.string().trim().min(1).max(10_000).optional(),
    priority: z.number().int().min(0).optional(),
  })
  .strict()
  .describe("Route-specific assistant work item instructions and priority override.");

const explicitNullableDefault = <T extends z.ZodType>(schema: T, defaultValue: z.output<T>) =>
  z.union([schema, z.null()]).transform((value) => value ?? defaultValue);

const optionalNullableDefault = <T extends z.ZodType>(schema: T, defaultValue: z.output<T>) =>
  z.union([schema, z.null()]).optional().transform((value) => value ?? defaultValue);

const assistantWorkRouteObjectSchema = z
  .object({
    eventType: providerAssistantWorkEventTypeSchema.describe(
      "Provider event type that should become assistant work for this profile.",
    ),
    connectedProviderAccountId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Optional connected provider account id for an account-scoped route. Omit for the profile-level default route.",
      ),
    config: assistantWorkRouteConfigSchema
      .default({})
      .describe("Typed event-specific route config."),
  })
  .strict();

const clientAssistantWorkRouteSchema = assistantWorkRouteObjectSchema.describe(
  "Profile-level opt-in route from provider event to assistant work item.",
);

const scheduledTaskKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers, and hyphens only.")
  .describe("Stable source key for this seed-created scheduled task.");

const clientScheduledTaskSchema = z
  .object({
    key: scheduledTaskKeySchema,
    title: z.string().trim().min(1).max(200).describe("Short scheduled task title."),
    instructions: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .describe("Instructions the assistant should follow each time this task runs."),
    schedule: assistantScheduleSchema.describe("When this scheduled task should run."),
    status: z
      .enum(["active", "paused"])
      .default("active")
      .describe("Initial status for this seed-created scheduled task."),
  })
  .strict()
  .describe("Source-declared scheduled assistant work created by the client seed.");

const clientGuidanceKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores only.")
  .describe("Stable DB-owned profile guidance key. Unique per profile while active.");

const clientGuidanceSchema = z
  .object({
    key: clientGuidanceKeySchema,
    title: z.string().trim().min(1).max(200).describe("Short maintainer-facing guidance title."),
    selectorDescription: z
      .string()
      .trim()
      .min(1)
      .max(1_000)
      .describe(
        "Selector-facing description used to decide when this profile guidance should be loaded.",
      ),
    bodyMarkdown: z
      .string()
      .trim()
      .min(1)
      .max(50_000)
      .describe("Markdown guidance body stored in the control database."),
  })
  .strict()
  .describe(
    "Create-only initial profile guidance row. Seed files bootstrap missing profiles; after launch, profile guidance is DB-owned and editing this source file must not update existing rows.",
  );

export const clientSeedSchema = z
  .object({
    schemaVersion: z.literal(1).describe("Client seed schema version."),
    profile: z
      .object({
        id: profileIdSchema,
        displayName: nonEmptyStringSchema.describe(
          "Human-readable profile name shown in Connect and generated setup context.",
        ),
        timezone: nonEmptyStringSchema.describe(
          "IANA timezone for this profile, such as America/Toronto.",
        ),
        status: z
          .enum(["active", "inactive"])
          .describe("Initial profile status created when this seed runs for a missing profile."),
        metadata: jsonObjectSchema
          .default({})
          .describe("Durable profile metadata safe to store in the control database."),
      })
      .strict()
      .describe("Initial backend profile identity and metadata."),
    portalUser: z
      .object({
        id: z
          .string()
          .uuid()
          .describe("Stable Supabase auth user id for deterministic local seeds.")
          .optional(),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .email()
          .describe("Connect login email for this profile user."),
        password: z.string().min(8).describe("Connect portal password for this profile user."),
        metadata: jsonObjectSchema.default({}).describe("Additional auth user metadata."),
      })
      .strict()
      .describe("Initial portal auth user that owns this profile."),
    initialAssistantName: nonEmptyStringSchema.describe(
      "Initial assistant display name stored in profile preferences.",
    ),
    initialCapabilities: z
      .array(clientCapabilitySchema)
      .describe("Capabilities to create for this profile during its initial seed."),
    initialChannels: explicitNullableDefault(z.array(clientChannelSchema), []).describe(
      "Initial direct channel identities for this profile.",
    ),
    initialWritePolicy: explicitNullableDefault(clientWritePolicySchema, {
      defaultMode: "auto_execute",
      actions: {},
    }),
    initialAssistantWorkRoutes: explicitNullableDefault(
      z.array(clientAssistantWorkRouteSchema),
      [],
    ).describe("Initial profile-level event types that should create assistant work items."),
    initialScheduledTasks: explicitNullableDefault(z.array(clientScheduledTaskSchema), []).describe(
      "Source-declared scheduled assistant tasks to create for this profile during initial seed.",
    ),
    initialGuidance: optionalNullableDefault(z.array(clientGuidanceSchema), []).describe(
      "Create-only initial DB-owned profile guidance rows for a missing profile. Once the profile has launched, these source declarations are stale bootstrap data; update live guidance in the database instead of editing or upserting seed rows.",
    ),
  })
  .strict()
  .describe("Maintainer-owned source for one AI assistants client initial DB seed.")
  .superRefine((input, ctx) => {
    const seenCapabilities = new Set<string>();
    for (const [index, capability] of input.initialCapabilities.entries()) {
      const spec = profileCapabilitySpec(capability.slug);
      if (!spec) {
        ctx.addIssue({
          code: "custom",
          path: ["initialCapabilities", index, "slug"],
          message: `Unknown capability slug ${JSON.stringify(capability.slug)}.`,
        });
        continue;
      }
      const provider = capability.provider ?? spec.defaultProvider;
      const pair = slugProviderPairSchema.safeParse({ slug: capability.slug, provider });
      if (!pair.success) {
        ctx.addIssue({
          code: "custom",
          path: ["initialCapabilities", index, "provider"],
          message: pair.error.issues.map((i) => i.message).join("; "),
        });
        continue;
      }
      const key = `${capability.slug}::${provider}`;
      if (seenCapabilities.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["initialCapabilities", index, "slug"],
          message: `Duplicate capability instance for slug ${JSON.stringify(capability.slug)} and provider ${JSON.stringify(provider)}.`,
        });
      }
      seenCapabilities.add(key);
    }

    const seenChannels = new Set<string>();
    for (const [index, channel] of input.initialChannels.entries()) {
      const key = `${channel.provider}:${channel.externalIdentity}`;
      if (seenChannels.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["initialChannels", index, "externalIdentity"],
          message: `Duplicate channel identity ${key}.`,
        });
      }
      seenChannels.add(key);
    }

    const seenWorkRoutes = new Set<string>();
    for (const [index, route] of input.initialAssistantWorkRoutes.entries()) {
      if (seenWorkRoutes.has(route.eventType)) {
        ctx.addIssue({
          code: "custom",
          path: ["initialAssistantWorkRoutes", index, "eventType"],
          message: `Duplicate assistant work route for event type ${route.eventType}.`,
        });
      }
      seenWorkRoutes.add(route.eventType);
      if (!route.config.instructions) {
        ctx.addIssue({
          code: "custom",
          path: ["initialAssistantWorkRoutes", index, "config", "instructions"],
          message: `Provider-event assistant work route ${route.eventType} requires object form with config.instructions.`,
        });
      }
    }

    const seenScheduledTasks = new Set<string>();
    for (const [index, task] of input.initialScheduledTasks.entries()) {
      if (seenScheduledTasks.has(task.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["initialScheduledTasks", index, "key"],
          message: `Duplicate scheduled task key ${task.key}.`,
        });
      }
      seenScheduledTasks.add(task.key);
    }

    const seenGuidance = new Set<string>();
    for (const [index, guidance] of input.initialGuidance.entries()) {
      if (seenGuidance.has(guidance.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["initialGuidance", index, "key"],
          message: `Duplicate profile guidance key ${guidance.key}.`,
        });
      }
      seenGuidance.add(guidance.key);
    }
  });

export const clientRuntimeSchema = z
  .object({
    schemaVersion: z.literal(1).describe("Client runtime config schema version."),
    profileId: profileIdSchema.describe("Backend profile id this runtime config belongs to."),
    runtimeProfiles: z
      .array(clientRuntimeProfileSchema)
      .min(1)
      .describe("Runtime profiles that should include this client."),
    defaultAssistant: z
      .boolean()
      .default(false)
      .describe("Whether this client should be the default backend runtime assistant."),
  })
  .strict()
  .describe("Maintainer-owned source for generated runtime inclusion and behavior.");

export type ClientSeedInput = z.input<typeof clientSeedSchema>;
export type ClientSeed = z.output<typeof clientSeedSchema>;
export type ClientChannel = z.output<typeof clientChannelSchema>;
export type ClientWritePolicy = z.output<typeof clientWritePolicySchema>;
export type ClientAssistantWorkRoute = z.output<typeof clientAssistantWorkRouteSchema>;
export type ClientScheduledTask = z.output<typeof clientScheduledTaskSchema>;
export type ClientGuidance = z.output<typeof clientGuidanceSchema>;
export type ClientRuntimeInput = z.input<typeof clientRuntimeSchema>;
export type ClientRuntime = z.output<typeof clientRuntimeSchema>;

export function defineClientSeed(seed: ClientSeedInput): ClientSeedInput {
  return seed;
}

export function defineClientRuntime(runtime: ClientRuntimeInput): ClientRuntimeInput {
  return runtime;
}
