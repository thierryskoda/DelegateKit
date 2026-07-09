import { z } from "zod";

import {
  CAPABILITY_ACTIVATION_POLICIES,
  capabilityActivationPolicyForSlug,
} from "./activation-policies";
import { profileCapabilitySlugSchema } from "./profile-capability-slug-schema";

/** Lowercase kebab-case id used for `capability_slug` and `provider` in the control DB (shape only at DB layer). */
export const capabilityIdentifierSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers, and hyphens only (kebab-case).",
  );

export { profileCapabilitySlugSchema } from "./profile-capability-slug-schema";

function sortedUniqueProviders(): [string, ...string[]] {
  const set = new Set<string>();
  for (const policy of Object.values(CAPABILITY_ACTIVATION_POLICIES)) {
    for (const p of policy.providers) set.add(p);
  }
  const sorted = [...set].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0)
    throw new Error("CAPABILITY_ACTIVATION_POLICIES must declare at least one provider.");
  return sorted as [string, ...string[]];
}

/** Every `provider` value that appears on any activation policy. */
export const capabilityProviderIdSchema = z.enum(sortedUniqueProviders());

export type CapabilityProviderId = z.infer<typeof capabilityProviderIdSchema>;

export const slugProviderPairSchema = z
  .object({
    slug: profileCapabilitySlugSchema,
    provider: capabilityProviderIdSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    const policy = capabilityActivationPolicyForSlug(val.slug);
    if (!policy) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown capability slug ${JSON.stringify(val.slug)}.`,
      });
      return;
    }
    if (!policy.providers.includes(val.provider)) {
      ctx.addIssue({
        code: "custom",
        message: `Provider ${JSON.stringify(val.provider)} is not allowed for capability ${JSON.stringify(val.slug)}. Allowed: ${policy.providers.join(", ")}.`,
      });
    }
  });

export type SlugProviderPair = z.infer<typeof slugProviderPairSchema>;

/** Validates `(slug, provider)` against activation policies (fail-fast). */
export function assertKnownSlugProviderPair(slug: string, provider: string): void {
  slugProviderPairSchema.parse({ slug, provider });
}
