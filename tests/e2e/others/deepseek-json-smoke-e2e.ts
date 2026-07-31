#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("DeepSeek JSON smoke prints help without provider setup.", () => {
  for (const helpFlag of ["--help", "-h"]) {
    const env = { ...process.env };
    delete env.DEEPSEEK_API_KEY;

    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/smoke/deepseek-json.ts", helpFlag],
      { cwd: process.cwd(), encoding: "utf8", env },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: npm run smoke:deepseek-json/);
    assert.equal(result.stderr, "");
  }
});

test("DeepSeek JSON smoke rejects unsupported models before provider setup.", () => {
  const env = { ...process.env };
  delete env.DEEPSEEK_API_KEY;

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/smoke/deepseek-json.ts", "--model=deepseek-unknown"],
    { cwd: process.cwd(), encoding: "utf8", env },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: npm run smoke:deepseek-json/);
  assert.doesNotMatch(result.stderr, /DEEPSEEK_API_KEY/);
});
