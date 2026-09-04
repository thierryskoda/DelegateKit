#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const clientsScript = "scripts/clients/clients.ts";

test("clients CLI prints root help once without running a command.", () => {
  for (const args of [[], ["--help"], ["-h"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", clientsScript, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.match(/^Usage:$/gm)?.length, 1);
    assert.match(result.stdout, /npm run clients -- validate/);
    assert.equal(result.stderr, "");
  }
});

test("clients CLI still rejects unknown commands.", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", clientsScript, "unknown"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command "unknown"/);
  assert.equal(result.stdout, "");
});
