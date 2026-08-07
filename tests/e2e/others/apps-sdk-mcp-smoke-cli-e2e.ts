#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const smokeScript = "scripts/smoke/apps-sdk-mcp.ts";

test("Apps SDK MCP smoke prints help without contacting a server.", () => {
  for (const helpFlag of ["--help", "-h"]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", smokeScript, helpFlag], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage:\n  npm run smoke:apps-sdk-mcp/);
    assert.equal(result.stderr, "");
  }
});

test("Apps SDK MCP smoke still requires a URL.", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", smokeScript], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:\n  npm run smoke:apps-sdk-mcp/);
  assert.equal(result.stdout, "");
});
