import { DomainError, domainCodes } from "@ai-assistants/errors";

function positiveIntegerArg(raw: string, label: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `${label} must be a positive integer; got ${JSON.stringify(raw)}.`,
    );
  }
  return parsed;
}

export function parseWorkerCliArgs(args: readonly string[]): {
  once: boolean;
  json: boolean;
  workerId?: string;
  leaseSeconds?: number;
} {
  let once = false;
  let json = false;
  let workerId: string | undefined;
  let leaseSeconds: number | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === "--once") {
      once = true;
    } else if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("--worker-id=")) {
      workerId = arg.slice("--worker-id=".length).trim();
      if (!workerId) throw new DomainError(domainCodes.INTERNAL, "--worker-id must not be empty.");
    } else if (arg === "--worker-id") {
      workerId = args[++i]?.trim();
      if (!workerId)
        throw new DomainError(domainCodes.INTERNAL, "--worker-id requires a non-empty value.");
    } else if (arg.startsWith("--lease-seconds=")) {
      leaseSeconds = positiveIntegerArg(arg.slice("--lease-seconds=".length), "--lease-seconds");
    } else if (arg === "--lease-seconds") {
      const value = args[++i];
      if (!value) throw new DomainError(domainCodes.INTERNAL, "--lease-seconds requires a value.");
      leaseSeconds = positiveIntegerArg(value, "--lease-seconds");
    } else {
      throw new DomainError(
        domainCodes.INTERNAL,
        `Unsupported backend worker option ${JSON.stringify(arg)}. Supported options: --once, --json, --worker-id, --lease-seconds.`,
      );
    }
  }
  return {
    once,
    json,
    ...(workerId === undefined ? {} : { workerId }),
    ...(leaseSeconds === undefined ? {} : { leaseSeconds }),
  };
}
