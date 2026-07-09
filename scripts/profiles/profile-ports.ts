import {
  isLocalSupabaseManagedProfile,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";

export type ProfileLocalPorts = {
  backend: number;
  connect: number;
  webBridge: number;
};

const PROFILE_LOCAL_PORTS = {
  dev: {
    backend: 8787,
    connect: 5173,
    webBridge: 15173,
  },
  e2e: {
    backend: 8877,
    connect: 5273,
    webBridge: 15273,
  },
} as const satisfies Record<"dev" | "e2e", ProfileLocalPorts>;

type LocalProfile = keyof typeof PROFILE_LOCAL_PORTS;

function assertLocalProfile(profile: RuntimeProfile): asserts profile is LocalProfile {
  if (!isLocalSupabaseManagedProfile(profile)) {
    throw new Error(`${profile} does not have local dev ports. Use cloud service URLs instead.`);
  }
}

export function localPortsForProfile(profile: RuntimeProfile): ProfileLocalPorts {
  assertLocalProfile(profile);
  return PROFILE_LOCAL_PORTS[profile];
}

const PROFILE_PUBLIC_BASE_URLS = {
  dev: "https://dev-assistant.example.com",
  e2e: "https://e2e-assistant.example.com",
} as const satisfies Record<"dev" | "e2e", `https://${string}`>;

export function publicBaseUrlForProfile(profile: RuntimeProfile): `https://${string}` {
  assertLocalProfile(profile);
  return PROFILE_PUBLIC_BASE_URLS[profile];
}

const PROFILE_SUPABASE_STUDIO_PORTS = {
  dev: 54323,
  e2e: 56323,
} as const satisfies Record<"dev" | "e2e", number>;

export function supabaseStudioLocalUrl(profile: RuntimeProfile): string {
  assertLocalProfile(profile);
  return `http://127.0.0.1:${PROFILE_SUPABASE_STUDIO_PORTS[profile]}`;
}
