/**
 * Tool Collections Export
 *
 * Lightweight entry point for in-process chaining.
 * Import this from another MCP server to chain tools without spawning a process.
 *
 * @example
 * ```typescript
 * import { collections, allModes, allModeNames, allSliceNames } from "my-umbraco-mcp/collections";
 *
 * manager.registerServer({
 *   transport: "in-process",
 *   name: "my-addon",
 *   collections,
 *   modeRegistry: allModes,
 *   allModeNames,
 *   allSliceNames,
 * });
 * ```
 */

import umbracoServerCollection from "./umbraco-api/tools/umbraco-server/index.js";
import approvalsCollection from "./umbraco-api/tools/approvals/index.js";
import automationsCollection from "./umbraco-api/tools/automations/index.js";
import catalogueCollection from "./umbraco-api/tools/catalogue/index.js";
import connectionsCollection from "./umbraco-api/tools/connections/index.js";
import metricsCollection from "./umbraco-api/tools/metrics/index.js";
import runsCollection from "./umbraco-api/tools/runs/index.js";
import versionHistoryCollection from "./umbraco-api/tools/version-history/index.js";
import workspacesCollection from "./umbraco-api/tools/workspaces/index.js";
import { withLenientOutputSchemas } from "./umbraco-api/tools/lenient-output-schemas.js";

// Open output objects to unknown keys, so fields a newer Automate adds don't fail
// client-side validation (see lenient-output-schemas.ts).
export const collections = [
  umbracoServerCollection,
  approvalsCollection,
  automationsCollection,
  catalogueCollection,
  connectionsCollection,
  metricsCollection,
  runsCollection,
  versionHistoryCollection,
  workspacesCollection,
].map(withLenientOutputSchemas);

export { allModes, allModeNames } from "./config/mode-registry.js";
export { allSliceNames } from "./config/slice-registry.js";

/** Orval client factory for this product, used by hosts that run several Umbraco MCPs in one process. */
export { getUmbracoAutomateManagementAPI as createApiClient } from "./umbraco-api/api/generated/umbracoAutomateManagementApi.js";
