export type TimedFetchOptions = Omit<RequestInit, "signal"> & {
  timeoutMs: number;
  signal?: AbortSignal;
};

export type TimedFetchClientOptions = {
  fetchImpl?: typeof fetch;
};

function requireTimeoutMs(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`timeoutMs must be a positive integer; got ${value}.`);
  }
  return value;
}

export class TimedFetchClient {
  readonly #fetchImpl: typeof fetch;

  constructor(options: TimedFetchClientOptions = {}) {
    this.#fetchImpl = options.fetchImpl ?? (((url, init) => fetch(url, init)) as typeof fetch);
  }

  async fetch(url: string | URL, options: TimedFetchOptions): Promise<Response> {
    const { timeoutMs, signal: sourceSignal, ...init } = options;
    const timeout = requireTimeoutMs(timeoutMs);
    const controller = new AbortController();
    const abortFromSource = (): void => {
      controller.abort(sourceSignal?.reason);
    };
    if (sourceSignal?.aborted) {
      abortFromSource();
    } else {
      sourceSignal?.addEventListener("abort", abortFromSource, { once: true });
    }
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Fetch timed out after ${timeout}ms.`));
    }, timeout);
    try {
      return await this.#fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      sourceSignal?.removeEventListener("abort", abortFromSource);
    }
  }
}

export const timedFetch = new TimedFetchClient();
