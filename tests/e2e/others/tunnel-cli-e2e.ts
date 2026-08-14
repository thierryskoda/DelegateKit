#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const tunnelScript = "scripts/tunnel/tunnel.ts";

test("tunnel CLI prints help without starting tunnel services.", () => {
  for (const helpFlag of ["--help", "-h"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", tunnelScript, helpFlag], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:\n  npm run tunnel -- dev status/);
    assert.equal(result.stderr, "");
  }
});

test("tunnel CLI still requires a profile and action.", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", tunnelScript], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:\n  npm run tunnel -- dev status/);
  assert.equal(result.stdout, "");
});
