const DEFAULT_E2E_PUBLIC_HOST = "e2e-assistant.example.com";
const FORBIDDEN_PUBLIC_HOST_FRAGMENTS = ["dev-assistant", "prod-assistant"] as const;
const FORBIDDEN_PUBLIC_HOSTS = new Set<string>();

export function requireE2eBackendPublicUrl(context: string): string {
  const raw = process.env.BACKEND_PUBLIC_URL?.trim();
  if (!raw) {
    throw new Error(`${context} requires BACKEND_PUBLIC_URL in the e2e profile env.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `${context} requires BACKEND_PUBLIC_URL to be an absolute URL; got ${JSON.stringify(raw)}.`,
    );
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${context} requires an HTTPS BACKEND_PUBLIC_URL; got ${raw}.`);
  }

  const host = parsed.hostname.toLowerCase();
  const forbiddenFragment = FORBIDDEN_PUBLIC_HOST_FRAGMENTS.find((fragment) =>
    host.includes(fragment),
  );
  if (forbiddenFragment || FORBIDDEN_PUBLIC_HOSTS.has(host)) {
    throw new Error(`${context} resolved non-e2e BACKEND_PUBLIC_URL ${raw}.`);
  }
  if (host !== DEFAULT_E2E_PUBLIC_HOST) {
    throw new Error(
      `${context} expected BACKEND_PUBLIC_URL host ${DEFAULT_E2E_PUBLIC_HOST}; got ${host}.`,
    );
  }

  return raw.replace(/\/+$/, "");
}
