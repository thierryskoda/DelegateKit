import { pathToFileURL } from "node:url";
import { getSupabaseServiceClient } from "@ai-assistants/control-db";
import { initBackendWorkerEnv } from "./bootstrap-env";
import { parseWorkerCliArgs } from "./runtime/worker/env";
import { runWorkerOnce } from "./runtime/worker/run-worker-once";
import { startWorkerLoop } from "./runtime/worker/worker-loop";

const invokedAsScript = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href,
);

if (invokedAsScript) {
  const env = initBackendWorkerEnv();
  const cli = parseWorkerCliArgs(process.argv.slice(2));
  const db = getSupabaseServiceClient();
  const workerId = cli.workerId ?? env.workerId ?? `worker-${process.pid}`;
  if (cli.once) {
    const result = await runWorkerOnce({
      db,
      workerId,
      leaseSeconds: cli.leaseSeconds ?? env.workerLeaseSeconds,
    });
    if (cli.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`AI assistants backend worker once: ${result.status}`);
    }
    if (result.status === "failed" || result.status === "requeued") process.exitCode = 1;
  } else {
    await startWorkerLoop({
      db,
      workerId,
      ...(cli.leaseSeconds === undefined ? {} : { leaseSeconds: cli.leaseSeconds }),
    });
  }
}
