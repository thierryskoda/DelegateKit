import type { DomainCode } from "./codes.js";

export type DomainErrorOptions = {
  cause?: unknown;
  details?: unknown;
};

export class DomainError extends Error {
  readonly code: DomainCode;
  readonly details?: unknown;

  constructor(code: DomainCode, message: string, options?: DomainErrorOptions) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "DomainError";
    this.code = code;
    this.details = options?.details;
  }
}
