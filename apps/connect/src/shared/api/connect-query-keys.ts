/**
 * Single source of truth for TanStack Query keys in Connect.
 * Prefix `connect` namespaces the cache; hierarchical keys let invalidation
 * target a list, an entire profile subtree, or one resource slice.
 */
const CONNECT_ROOT = ["connect"] as const;

function profilesList(): readonly ["connect", "profiles"] {
  return [...CONNECT_ROOT, "profiles"] as const;
}

function profileDetail(profileId: string): readonly ["connect", "profiles", string] {
  return [...profilesList(), profileId] as const;
}

export const connectQueryKeys = {
  root: () => CONNECT_ROOT,

  profiles: {
    /** Profile list + every profile-scoped query (prefix match on `["connect","profiles", …]`). */
    list: profilesList,
    /** One Connect profile: integrations, approvals, and related setup under this id. */
    detail: profileDetail,
  },

  integrations: {
    list: (profileId: string) => [...profileDetail(profileId), "integrations"] as const,
  },

  approvals: {
    actions: (profileId: string) => [...profileDetail(profileId), "approvals"] as const,
    proposals: (profileId: string) =>
      [...profileDetail(profileId), "approvals", "proposals"] as const,
    learningRecommendations: (profileId: string) =>
      [...profileDetail(profileId), "approvals", "learning-recommendations"] as const,
  },

  browserHandoffs: {
    detail: (profileId: string, handoffId: string) =>
      [...profileDetail(profileId), "browser-handoffs", handoffId] as const,
  },
} as const;
