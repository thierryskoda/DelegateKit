import { z } from "zod";
import {
  capabilityProviderIdSchema,
  profileCapabilitySlugSchema,
} from "@ai-assistants/capability-catalog";
import {
  nangoBoundSlugProviderPairSchema,
  nangoProviderConfigKeyForCapabilityProvider,
} from "@ai-assistants/nango-provisioning";

const bindingEntrySchema = z
  .object({
    profileId: z.string().trim().min(1).default("testing"),
    capabilitySlug: profileCapabilitySlugSchema,
    provider: capabilityProviderIdSchema,
    nangoConnectionId: z.string().uuid(),
    capabilityAccountLinkId: z.string().uuid().optional(),
    capabilityAccountLinkLabel: z.string().trim().min(1).optional(),
    providerAccountId: z.string().trim().min(1).optional(),
    accountEmail: z.string().trim().email().nullable().optional(),
    displayLabel: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const r = nangoBoundSlugProviderPairSchema.safeParse({
      slug: val.capabilitySlug,
      provider: val.provider,
    });
    if (r.success) return;
    ctx.addIssue({
      code: "custom",
      message: r.error.issues.map((i) => i.message).join("; "),
    });
  });

const bindingsFileSchema = z
  .object({
    bindings: z.array(bindingEntrySchema).default([]),
  })
  .strict();

export type ProfileNangoBindingEntry = z.infer<typeof bindingEntrySchema>;

export function profileNangoBindingIdentity(binding: ProfileNangoBindingEntry): string {
  return [
    binding.profileId,
    binding.capabilitySlug,
    binding.provider,
    binding.nangoConnectionId,
  ].join(":");
}

export function removeProfileNangoBindings(
  bindings: readonly ProfileNangoBindingEntry[],
  staleBindings: readonly ProfileNangoBindingEntry[],
): ProfileNangoBindingEntry[] {
  const stale = new Set(staleBindings.map(profileNangoBindingIdentity));
  return bindings.filter((binding) => !stale.has(profileNangoBindingIdentity(binding)));
}

export function stringifyProfileNangoBindingsFile(
  bindings: readonly ProfileNangoBindingEntry[],
): string {
  return `${JSON.stringify({ bindings }, null, 2)}\n`;
}

function validateBindingUniqueness(bindings: readonly ProfileNangoBindingEntry[]): void {
  const byLinkTarget = new Map<string, number>();
  const byRemote = new Map<string, Set<string>>();
  for (const b of bindings) {
    const triple = `${b.profileId}:${b.capabilitySlug}:${b.provider}`;
    const key = nangoProviderConfigKeyForCapabilityProvider(b.capabilitySlug, b.provider);
    if (!key) throw new Error(`No Nango key for binding ${triple}.`);
    const remoteOwner = `${b.profileId}:${key}`;
    const linkTarget =
      b.capabilityAccountLinkId ??
      `${triple}:${b.capabilityAccountLinkLabel?.trim() || "<default-label>"}`;
    byLinkTarget.set(linkTarget, (byLinkTarget.get(linkTarget) ?? 0) + 1);
    const owners = byRemote.get(b.nangoConnectionId) ?? new Set<string>();
    owners.add(remoteOwner);
    byRemote.set(b.nangoConnectionId, owners);
  }
  const dupLinkTarget = [...byLinkTarget.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  if (dupLinkTarget.length) {
    throw new Error(
      `Duplicate binding keys (profileId+capabilitySlug+provider+capability account link target): ${dupLinkTarget.join("; ")}`,
    );
  }
  const dupRemote = [...byRemote.entries()]
    .filter(([, owners]) => owners.size > 1)
    .map(([remote, owners]) => `${remote} (${[...owners].join(", ")})`);
  if (dupRemote.length) {
    throw new Error(
      `Duplicate nangoConnectionId across unrelated bindings: ${dupRemote.join("; ")}`,
    );
  }
}

export function parseProfileNangoBindingsFile(raw: unknown): z.infer<typeof bindingsFileSchema> {
  const parsed = bindingsFileSchema.parse(raw);
  validateBindingUniqueness(parsed.bindings);
  return parsed;
}
