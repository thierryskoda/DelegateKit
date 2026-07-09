import { DomainError, domainCodes } from "@ai-assistants/errors";
import { timedFetch } from "@ai-assistants/workspace-shared/timed-fetch";
import { z } from "zod";
import type { VisionImagePart } from "./pdf-vision";
import { backendApiEnv } from "../../shared/env";

type OpenAiVisionInput = {
  instructions: string;
  prompt: string;
  images: readonly VisionImagePart[];
  responseKind: "text" | "json";
};

const OPENAI_VISION_MODEL = "gpt-4.1-mini";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_TIMEOUT_MS = 60_000;

const outputTextSchema = z
  .object({
    type: z.literal("output_text"),
    text: z.string(),
  })
  .passthrough();

const responseOutputSchema = z
  .object({
    output: z.array(
      z
        .object({
          content: z.array(z.unknown()).optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

function openAiApiKey(): string {
  const key = backendApiEnv().openAiApiKey.trim();
  if (!key) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "OPENAI_API_KEY is required for LLM file analysis.",
    );
  }
  return key;
}

function extractOutputText(body: unknown): string {
  const parsed = responseOutputSchema.parse(body);
  const text = parsed.output
    .flatMap((item) => item.content ?? [])
    .map((content) => outputTextSchema.safeParse(content))
    .filter((result) => result.success)
    .map((result) => result.data.text)
    .join("\n")
    .trim();
  if (!text) {
    throw new DomainError(domainCodes.INTERNAL, "Vision model returned no readable text.");
  }
  return text;
}

function responseFormat(responseKind: OpenAiVisionInput["responseKind"]) {
  if (responseKind === "json") {
    return { format: { type: "json_object" } };
  }
  return undefined;
}

export async function generateVisionText(input: OpenAiVisionInput): Promise<string> {
  if (!input.prompt.trim()) throw new DomainError(domainCodes.BAD_REQUEST, "File analysis prompt is required.");
  try {
    const response = await timedFetch.fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      timeoutMs: OPENAI_TIMEOUT_MS,
      headers: {
        authorization: `Bearer ${openAiApiKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_VISION_MODEL,
        instructions: input.instructions,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: input.prompt },
              ...input.images.map((image) => ({
                type: "input_image",
                image_url: `data:${image.mimeType};base64,${image.base64}`,
                detail: "high",
              })),
            ],
          },
        ],
        ...(responseFormat(input.responseKind) ? { text: responseFormat(input.responseKind) } : {}),
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new DomainError(domainCodes.INTERNAL, "OpenAI vision analysis failed.", {
        details: {
          status: response.status,
          body,
        },
      });
    }
    return extractOutputText(body);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(domainCodes.INTERNAL, "OpenAI vision analysis failed.", { cause: error });
  }
}
