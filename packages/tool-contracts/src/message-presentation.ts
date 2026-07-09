import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const messagePresentationCallbackTokenSegmentSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Use letters, numbers, underscores, or hyphens.")
  .describe("One safe, non-secret callback token segment.");

export const messagePresentationCallbackTokenSchema = z
  .string()
  .trim()
  .min(3)
  .max(128)
  .regex(
    /^[a-z0-9][a-z0-9_-]*(?::[a-z0-9][a-z0-9_-]*){1,3}$/i,
    "Use 2-4 colon-separated safe segments, such as brief:headlines.",
  )
  .describe(
    "Safe callback token returned by compact message controls. Do not include secrets, JSON, URLs, file paths, or hidden provider credentials.",
  )
  .meta({ examples: ["brief:headlines", "approval:approve:abc123", "calendar:slot:slot_42"] });

export type MessagePresentationCallbackToken = z.infer<
  typeof messagePresentationCallbackTokenSchema
>;

export const messagePresentationButtonSchema = z
  .object({
    label: nonEmptyString
      .max(80)
      .describe("Short button label displayed by channels that support interactive controls."),
    value: messagePresentationCallbackTokenSchema
      .describe("Stable callback token returned when the button is clicked.")
      .optional(),
    url: nonEmptyString
      .url()
      .refine((url) => url.startsWith("https://"), {
        message: "Message presentation button URLs must use HTTPS.",
      })
      .describe("HTTPS URL opened when the button is clicked.")
      .optional(),
    style: z
      .enum(["primary", "secondary", "success", "danger"])
      .describe("Semantic button style hint; channels may render or ignore it.")
      .optional(),
  })
  .strict()
  .refine((button) => Boolean(button.value || button.url), {
    message: "Message presentation buttons require either value or url.",
  });

export const messagePresentationOptionSchema = z
  .object({
    label: nonEmptyString
      .max(80)
      .describe("Short option label displayed by channels that support selects."),
    value: messagePresentationCallbackTokenSchema.describe(
      "Stable callback token returned when the option is selected.",
    ),
  })
  .strict();

export const messagePresentationSchema = z
  .object({
    title: nonEmptyString
      .max(200)
      .describe("Optional compact presentation title.")
      .optional(),
    tone: z
      .enum(["neutral", "info", "success", "warning", "danger"])
      .describe("Semantic tone hint; channels may render or ignore it.")
      .optional(),
    blocks: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              type: z.literal("text"),
              text: nonEmptyString.max(700).describe("Visible text block."),
            })
            .strict(),
          z
            .object({
              type: z.literal("context"),
              text: nonEmptyString.max(300).describe("Secondary visible context text."),
            })
            .strict(),
          z
            .object({
              type: z.literal("divider"),
            })
            .strict(),
          z
            .object({
              type: z.literal("buttons"),
              buttons: z
                .array(messagePresentationButtonSchema)
                .min(1)
                .max(10)
                .describe("Interactive buttons for channels that support inline controls."),
            })
            .strict(),
          z
            .object({
              type: z.literal("select"),
              placeholder: nonEmptyString
                .max(120)
                .describe("Optional select placeholder.")
                .optional(),
              options: z
                .array(messagePresentationOptionSchema)
                .min(1)
                .max(25)
                .describe("Interactive select options for channels that support selects."),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(20)
      .describe(
        "Portable assistant message presentation blocks. Channels render these natively when supported or degrade to text.",
      ),
  })
  .strict();

export type MessagePresentation = z.infer<typeof messagePresentationSchema>;
export type MessagePresentationButton = z.infer<typeof messagePresentationButtonSchema>;
export type MessagePresentationOption = z.infer<typeof messagePresentationOptionSchema>;
export type MessagePresentationTone = NonNullable<MessagePresentation["tone"]>;
export type MessagePresentationBlock = MessagePresentation["blocks"][number];

export type MessagePresentationPayload = {
  text: string;
  presentation: MessagePresentation;
};

export const replyPayloadDeliverySchema = z
  .object({
    pin: z
      .union([
        z.boolean(),
        z
          .object({
            enabled: z.boolean().describe("Whether the sent message should be pinned."),
            notify: z
              .boolean()
              .describe("Whether channel users should be notified about the pin when supported.")
              .optional(),
            required: z
              .boolean()
              .describe("Whether delivery should fail if the channel cannot pin.")
              .optional(),
          })
          .strict(),
      ])
      .describe("Generic message pinning preference for channels that support it.")
      .optional(),
  })
  .strict();

export type ReplyPayloadDelivery = z.infer<typeof replyPayloadDeliverySchema>;

export function formatMessagePresentationCallbackToken(
  namespace: string,
  action: string,
  ...rest: readonly string[]
): MessagePresentationCallbackToken {
  const segments = [namespace, action, ...rest];
  for (const segment of segments) {
    messagePresentationCallbackTokenSegmentSchema.parse(segment);
  }
  return messagePresentationCallbackTokenSchema.parse(segments.join(":"));
}

export function parseMessagePresentationCallbackToken(value: string):
  | {
      namespace: string;
      action: string;
      id?: string;
      detail?: string;
      segments: readonly string[];
    }
  | null {
  const parsed = messagePresentationCallbackTokenSchema.safeParse(value);
  if (!parsed.success) return null;
  const segments = parsed.data.split(":");
  const namespace = segments[0];
  const action = segments[1];
  if (!namespace || !action) return null;
  const id = segments[2];
  const detail = segments[3];
  return {
    namespace,
    action,
    ...(id ? { id } : {}),
    ...(detail ? { detail } : {}),
    segments,
  };
}

const shortTextSchema = nonEmptyString
  .max(240)
  .describe("Short fallback text sent with the presentation.");
const titleSchema = nonEmptyString.max(120);
const itemTextSchema = nonEmptyString.max(220);

const presentationActionSchema = z
  .object({
    label: nonEmptyString.max(40),
    value: messagePresentationCallbackTokenSchema,
    style: z.enum(["primary", "secondary", "success", "danger"]).optional(),
  })
  .strict();

const urlActionSchema = z
  .object({
    label: nonEmptyString.max(40),
    url: nonEmptyString
      .url()
      .refine((url) => url.startsWith("https://"), {
        message: "Message presentation button URLs must use HTTPS.",
      }),
    style: z.enum(["primary", "secondary", "success", "danger"]).optional(),
  })
  .strict();

const anyActionSchema = z.union([presentationActionSchema, urlActionSchema]);

function parsePayload(text: string, presentation: MessagePresentation): MessagePresentationPayload {
  return {
    text: shortTextSchema.parse(text),
    presentation: messagePresentationSchema.parse(presentation),
  };
}

function buttonFromAction(action: z.infer<typeof anyActionSchema>): MessagePresentationButton {
  if ("url" in action) {
    return {
      label: action.label,
      url: action.url,
      ...(action.style ? { style: action.style } : {}),
    };
  }
  return {
    label: action.label,
    value: action.value,
    ...(action.style ? { style: action.style } : {}),
  };
}

export const choiceMenuPresentationInputSchema = z
  .object({
    text: shortTextSchema,
    title: titleSchema.optional(),
    tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
    body: itemTextSchema.optional(),
    choices: z.array(anyActionSchema).min(1).max(10),
  })
  .strict();

export type ChoiceMenuPresentationInput = z.infer<typeof choiceMenuPresentationInputSchema>;

export function buildChoiceMenuPresentation(
  input: ChoiceMenuPresentationInput,
): MessagePresentationPayload {
  const parsed = choiceMenuPresentationInputSchema.parse(input);
  return parsePayload(parsed.text, {
    ...(parsed.title ? { title: parsed.title } : {}),
    tone: parsed.tone ?? "neutral",
    blocks: [
      ...(parsed.body ? ([{ type: "text", text: parsed.body }] satisfies MessagePresentationBlock[]) : []),
      { type: "buttons", buttons: parsed.choices.map(buttonFromAction) },
    ],
  });
}

export const sectionDrilldownPresentationInputSchema = z
  .object({
    text: shortTextSchema,
    title: titleSchema.optional(),
    summary: itemTextSchema.optional(),
    sections: z
      .array(
        z
          .object({
            label: nonEmptyString.max(40),
            value: messagePresentationCallbackTokenSchema,
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export type SectionDrilldownPresentationInput = z.infer<
  typeof sectionDrilldownPresentationInputSchema
>;

export function buildSectionDrilldownPresentation(
  input: SectionDrilldownPresentationInput,
): MessagePresentationPayload {
  const parsed = sectionDrilldownPresentationInputSchema.parse(input);
  return parsePayload(parsed.text, {
    ...(parsed.title ? { title: parsed.title } : {}),
    tone: "info",
    blocks: [
      ...(parsed.summary
        ? ([{ type: "context", text: parsed.summary }] satisfies MessagePresentationBlock[])
        : []),
      {
        type: "buttons",
        buttons: parsed.sections.map((section) => ({
          label: section.label,
          value: section.value,
        })),
      },
    ],
  });
}

export const confirmCancelPresentationInputSchema = z
  .object({
    text: shortTextSchema,
    title: titleSchema.optional(),
    body: itemTextSchema.optional(),
    confirm: presentationActionSchema.extend({
      style: z.literal("success").or(z.literal("danger")).or(z.literal("primary")).optional(),
    }),
    cancel: presentationActionSchema.extend({
      style: z.literal("secondary").optional(),
    }),
    tone: z.enum(["warning", "danger", "neutral", "info"]).optional(),
  })
  .strict();

export type ConfirmCancelPresentationInput = z.infer<typeof confirmCancelPresentationInputSchema>;

export function buildConfirmCancelPresentation(
  input: ConfirmCancelPresentationInput,
): MessagePresentationPayload {
  const parsed = confirmCancelPresentationInputSchema.parse(input);
  return parsePayload(parsed.text, {
    ...(parsed.title ? { title: parsed.title } : {}),
    tone: parsed.tone ?? "warning",
    blocks: [
      ...(parsed.body ? ([{ type: "text", text: parsed.body }] satisfies MessagePresentationBlock[]) : []),
      {
        type: "buttons",
        buttons: [
          buttonFromAction({ ...parsed.confirm, style: parsed.confirm.style ?? "primary" }),
          buttonFromAction({ ...parsed.cancel, style: parsed.cancel.style ?? "secondary" }),
        ],
      },
    ],
  });
}

export const statusSummaryPresentationInputSchema = z
  .object({
    text: shortTextSchema,
    title: titleSchema.optional(),
    tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
    lines: z.array(itemTextSchema).min(1).max(6),
    actions: z.array(anyActionSchema).max(5).optional(),
  })
  .strict();

export type StatusSummaryPresentationInput = z.infer<typeof statusSummaryPresentationInputSchema>;

export function buildStatusSummaryPresentation(
  input: StatusSummaryPresentationInput,
): MessagePresentationPayload {
  const parsed = statusSummaryPresentationInputSchema.parse(input);
  const blocks: MessagePresentationBlock[] = parsed.lines.map((line) => ({
    type: "context",
    text: line,
  }));
  if (parsed.actions?.length) {
    blocks.push({ type: "buttons", buttons: parsed.actions.map(buttonFromAction) });
  }
  return parsePayload(parsed.text, {
    ...(parsed.title ? { title: parsed.title } : {}),
    tone: parsed.tone ?? "neutral",
    blocks,
  });
}

export const digestNavPresentationInputSchema = z
  .object({
    text: shortTextSchema,
    title: titleSchema.optional(),
    headline: itemTextSchema.optional(),
    sections: z
      .array(
        z
          .object({
            label: nonEmptyString.max(32),
            value: messagePresentationCallbackTokenSchema,
          })
          .strict(),
      )
      .min(1)
      .max(8),
    secondaryActions: z.array(anyActionSchema).max(2).optional(),
  })
  .strict();

export type DigestNavPresentationInput = z.infer<typeof digestNavPresentationInputSchema>;

export function buildDigestNavPresentation(
  input: DigestNavPresentationInput,
): MessagePresentationPayload {
  const parsed = digestNavPresentationInputSchema.parse(input);
  return parsePayload(parsed.text, {
    ...(parsed.title ? { title: parsed.title } : {}),
    tone: "info",
    blocks: [
      ...(parsed.headline
        ? ([{ type: "context", text: parsed.headline }] satisfies MessagePresentationBlock[])
        : []),
      {
        type: "buttons",
        buttons: parsed.sections.map((section) => ({
          label: section.label,
          value: section.value,
        })),
      },
      ...(parsed.secondaryActions?.length
        ? ([
            { type: "buttons", buttons: parsed.secondaryActions.map(buttonFromAction) },
          ] satisfies MessagePresentationBlock[])
        : []),
    ],
  });
}

export const compactDigestPresentationExample = buildDigestNavPresentation({
  text: "Today's brief is ready.",
  title: "Daily Brief",
  headline: "Three sections need attention.",
  sections: [
    { label: "Headlines", value: "brief:headlines" },
    { label: "Decisions", value: "brief:decisions" },
    { label: "Schedule", value: "brief:schedule" },
  ],
});
