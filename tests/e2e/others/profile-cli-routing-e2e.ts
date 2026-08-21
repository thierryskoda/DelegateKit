#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const profileScript = "scripts/profiles/profile-cli.ts";

test("profile CLI rejects the unsupported tailscale command at the router.", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", profileScript, "tailscale", "status", "--profile=dev"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown profile command "tailscale"/);
  assert.match(result.stderr, /npm run tunnel -- dev\|e2e status\|env\|up\|down/);
  assert.doesNotMatch(result.stderr, /scripts\/profiles\/connect\.ts/);
  assert.equal(result.stdout, "");
});

test("profile CLI keeps supported command help side-effect free.", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", profileScript, "connect", "--help"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:\n  npm run profile -- build/);
  assert.equal(result.stderr, "");
});
