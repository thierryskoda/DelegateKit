#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const diagnosticsScript = "scripts/diagnostics/diagnostics.ts";

test("diagnostics CLI prints root help without running a command.", () => {
  for (const helpFlag of ["--help", "-h"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", diagnosticsScript, helpFlag], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.match(/^Usage:$/gm)?.length, 1);
    assert.match(result.stdout, /npm run diagnostics -- query/);
    assert.equal(result.stderr, "");
  }
});

test("diagnostics CLI still requires a known command.", () => {
  for (const args of [[], ["unknown"]]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", diagnosticsScript, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      args.length === 0 ? /Usage:/ : /Unknown command "unknown"/,
    );
  }
});
