import { z } from "zod";

import { slugProviderPairSchema } from "@ai-assistants/capability-catalog";
import { nangoProviderConfigKeyForCapabilityProvider } from "./manifest";

/**
 * For Nango-backed setup flows: pair must be activation-valid and have a Nango provisioning mapping
 * (so `nangoProviderConfigKey` can be resolved).
 */
export const nangoBoundSlugProviderPairSchema = slugProviderPairSchema.superRefine((val, ctx) => {
  const key = nangoProviderConfigKeyForCapabilityProvider(val.slug, val.provider);
  if (!key?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: `No Nango provisioning entry maps slug ${JSON.stringify(val.slug)} + provider ${JSON.stringify(val.provider)}.`,
    });
  }
});

export type NangoBoundSlugProviderPair = z.infer<typeof nangoBoundSlugProviderPairSchema>;
