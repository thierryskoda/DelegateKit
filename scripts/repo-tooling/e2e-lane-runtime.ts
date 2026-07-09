export type E2eLaneSupabasePorts = {
  api: number;
  db: number;
  shadow: number;
  pooler: number;
  studio: number;
  inbucket: number;
  analytics: number;
};

export type E2eLaneRuntime = {
  runId: string;
  shortId: string;
  projectId: string;
  dockerContext: string;
  runtimeRoot: string;
  envPath: string;
  supabaseWorkdir: string;
  ports: E2eLaneSupabasePorts;
  metadataPath: string;
};

export type E2eLaneRuntimeMetadata = {
  kind: "ai-assistants.e2e.lane-runtime";
  runId: string;
  projectId: string;
  dockerContext: string;
  runtimeRoot: string;
  envPath: string;
  supabaseWorkdir: string;
  ports: E2eLaneSupabasePorts;
  createdAt: string;
  pid: number;
  cwd: string;
};
