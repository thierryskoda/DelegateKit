/**
 * Smoke test: workspace resolves @ai-assistants/codex-agent and built argv runs codex.
 */
import { spawnSync } from "node:child_process";
import {
  buildCodexExecCommand,
  codexAgentHeadlessBaseOptionsFromEnv,
} from "@ai-assistants/codex-agent";

const argv = buildCodexExecCommand(
  codexAgentHeadlessBaseOptionsFromEnv(),
  {
    prompt: "smoke-unused",
    extraArgs: ["--version"],
  },
);
const [bin, ...args] = argv;
const r = spawnSync(bin, args, { encoding: "utf8" });
if (r.error) {
  console.error(r.error);
  process.exit(1);
}
if (r.status !== 0) {
  console.error("stderr:", r.stderr);
  process.exit(r.status ?? 1);
}
const out = (r.stdout ?? "").trim();
if (!/^codex-cli(?:-exec)? \d+\.\d+\.\d+$/.test(out)) {
  console.error("unexpected --version output:", out);
  process.exit(1);
}
console.log("codex-agent OK:", out);
