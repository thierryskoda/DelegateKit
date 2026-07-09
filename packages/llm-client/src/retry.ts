const DEFAULT_LLM_CALL_ATTEMPTS = 3;

export type LlmRetryOptions = {
  /**
   * Full wrapper attempts for model calls. This is separate from AI SDK `maxRetries`,
   * which handles transport/provider retry behavior before object validation.
   */
  callAttempts?: number;
};

function normalizedAttemptCount(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LLM_CALL_ATTEMPTS;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`llm callAttempts must be a positive integer; got ${JSON.stringify(value)}.`);
  }
  return value;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("abort"))
  );
}

export async function withLlmCallRetries<T>(
  options: LlmRetryOptions,
  call: () => Promise<T>,
): Promise<T> {
  const attempts = normalizedAttemptCount(options.callAttempts);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      if (isAbortError(error)) throw error;
      lastError = error;
      if (attempt === attempts) throw error;
    }
  }
  throw lastError;
}

