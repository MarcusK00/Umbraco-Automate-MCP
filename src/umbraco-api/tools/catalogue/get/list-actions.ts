/**
 * List Catalogue Actions Tool
 *
 * Lists the action step definitions available for building automations,
 * optionally scoped to what a specific workspace's connections support.
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
  getCatalogueActionsQueryParams,
  getCatalogueActionsResponse,
} from "../../../api/generated/umbracoAutomateManagementApi.zod.js";

type ApiClient = ReturnType<typeof getUmbracoAutomateManagementAPI>;

const outputSchema = z.object({ items: getCatalogueActionsResponse });

const inputSchema = {
  ...getCatalogueActionsQueryParams.shape,
  workspaceId: getCatalogueActionsQueryParams.shape.workspaceId.describe(
    "Optional. Only return items usable with connections configured in this workspace (id from list-workspaces).",
  ),
};

const listCatalogueActionsTool = {
  name: "list-catalogue-actions",
  description:
    "Lists the available action step definitions that can be added to an automation. Each item's `alias` is the identifier used to reference that action when adding a step to an automation in the automations collection, and `connectionTypeAlias` (when present) identifies which connection type a step of this action requires. Optionally pass a `workspaceId` to only return actions usable with connections configured in that workspace. Call this before adding an action step to discover valid aliases and their settings schema. When an item's `hasDynamicOutputSchema` is true, its `outputSchema` here is only a generic placeholder and may not match the real shape - call resolve-step-type-output-schema with the configured settings to get the fields later steps can bind to.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async (params) => {
    return executeGetItemsApiCall<ReturnType<ApiClient["getCatalogueActions"]>, ApiClient>(
      (client) => client.getCatalogueActions(params, CAPTURE_RAW_HTTP_RESPONSE)
    );
  },
} satisfies ToolDefinition<typeof inputSchema, typeof outputSchema>;

export default withStandardDecorators(listCatalogueActionsTool);
