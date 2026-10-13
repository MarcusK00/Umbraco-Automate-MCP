/**
 * List Catalogue Step Types Tool
 *
 * Lists all step type definitions across every category (actions,
 * control-flows, triggers, etc.) in a single flat list.
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
  getCatalogueStepTypesQueryParams,
  getCatalogueStepTypesResponse,
} from "../../../api/generated/umbracoAutomateManagementApi.zod.js";

type ApiClient = ReturnType<typeof getUmbracoAutomateManagementAPI>;

const outputSchema = z.object({ items: getCatalogueStepTypesResponse });

const inputSchema = {
  ...getCatalogueStepTypesQueryParams.shape,
  type: getCatalogueStepTypesQueryParams.shape.type.describe(
    "Optional category filter, using a `type` value as returned by this tool when called without it. Omit to list every category.",
  ),
};

const listCatalogueStepTypesTool = {
  name: "list-catalogue-step-types",
  description:
    "Lists all step type definitions available for building an automation, across every category (actions, control-flows, triggers, and more) in one flat list. Each item's `alias` is the identifier used when adding a step to an automation, and `type` identifies which category it belongs to. Optionally pass `type` to filter to a single category. Prefer the category-specific tools (list-catalogue-actions, list-catalogue-control-flows, list-catalogue-triggers) when you already know the category you need; use this tool when you need an overview across all categories or don't know which category a step belongs to. When an item's `hasDynamicOutputSchema` is true, its `outputSchema` here is only a generic placeholder and may not match the real shape - call resolve-step-type-output-schema with the configured settings to get the fields later steps can bind to.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async (params) => {
    return executeGetItemsApiCall<ReturnType<ApiClient["getCatalogueStepTypes"]>, ApiClient>(
      (client) => client.getCatalogueStepTypes(params, CAPTURE_RAW_HTTP_RESPONSE)
    );
  },
} satisfies ToolDefinition<typeof inputSchema, typeof outputSchema>;

export default withStandardDecorators(listCatalogueStepTypesTool);
