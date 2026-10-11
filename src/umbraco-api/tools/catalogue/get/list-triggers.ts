/**
 * List Catalogue Triggers Tool
 *
 * Lists the trigger definitions available for starting an automation
 * (e.g. content published, schedule, webhook received).
 */

import {
  withStandardDecorators,
  executeGetItemsApiCall,
  CAPTURE_RAW_HTTP_RESPONSE,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { z } from "zod";
import type { getUmbracoAutomateManagementAPI } from "../../../api/generated/umbracoAutomateManagementApi.js";
import {
  getCatalogueTriggersQueryParams,
  getCatalogueTriggersResponseItem,
} from "../../../api/generated/umbracoAutomateManagementApi.zod.js";

type ApiClient = ReturnType<typeof getUmbracoAutomateManagementAPI>;

// Automate builds that predate `supportsManualRun` omit it, so it must not be
// required or every call fails output validation on those instances.
const triggerItemSchema = getCatalogueTriggersResponseItem.extend({
  supportsManualRun: getCatalogueTriggersResponseItem.shape.supportsManualRun.optional(),
});

const outputSchema = z.object({ items: z.array(triggerItemSchema) });

const inputSchema = {
  ...getCatalogueTriggersQueryParams.shape,
  workspaceId: getCatalogueTriggersQueryParams.shape.workspaceId.describe(
    "Optional. Only return items usable with connections configured in this workspace (id from list-workspaces).",
  ),
};

const listCatalogueTriggersTool = {
  name: "list-catalogue-triggers",
  description:
    "Lists the available trigger definitions that can start an automation (e.g. content published, schedule, webhook received). Each item's `alias` is the identifier used to reference that trigger when configuring an automation's trigger step, `supportsManualRun` (when present) indicates whether the trigger can also be fired manually, and `connectionTypeAlias` (when present) identifies which connection type it requires. Optionally pass a `workspaceId` to only return triggers usable with connections configured in that workspace. Call this before configuring an automation's trigger to discover valid aliases and their settings schema. When an item's `hasDynamicOutputSchema` is true, its `outputSchema` here is only a generic placeholder and may not match the real shape - call resolve-step-type-output-schema with the configured settings to get the fields later steps can bind to.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async (params) => {
    return executeGetItemsApiCall<ReturnType<ApiClient["getCatalogueTriggers"]>, ApiClient>(
      (client) => client.getCatalogueTriggers(params, CAPTURE_RAW_HTTP_RESPONSE)
    );
  },
} satisfies ToolDefinition<typeof inputSchema, typeof outputSchema>;

export default withStandardDecorators(listCatalogueTriggersTool);
