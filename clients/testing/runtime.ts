// Runtime source of truth: re-read on build/start for inclusion and default selection.
// Initial DB bootstrap data belongs in seed.ts.
import { defineClientRuntime } from "../../scripts/clients/schema";

export default defineClientRuntime({
  schemaVersion: 1,
  profileId: "testing",
  runtimeProfiles: ["e2e"],
  defaultAssistant: true,
});
