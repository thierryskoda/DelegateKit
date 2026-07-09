import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const comparisonKey = randomBytes(32);

function comparisonDigest(value: string): Buffer {
  // Normalize variable-length strings to fixed-size keyed digests before the constant-time compare.
  return createHmac("sha256", comparisonKey).update(value, "utf8").digest();
}

export function constantTimeStringEqual(actual: string, expected: string): boolean {
  const actualDigest = comparisonDigest(actual);
  const expectedDigest = comparisonDigest(expected);
  return timingSafeEqual(actualDigest, expectedDigest);
}
