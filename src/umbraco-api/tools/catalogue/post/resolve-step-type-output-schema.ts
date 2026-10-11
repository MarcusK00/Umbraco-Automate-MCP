/**
 * Resolve Step Type Output Schema Tool
 *
 * Computes the JSON output schema a step type would produce for a given
 * configuration. Some step types have a dynamic output schema that depends
 * on their settings (e.g. a database query action's output shape depends on
 * the configured query), so this must be resolved rather than read statically
 * from the catalogue entry.
 *
 * The API answers 200 with a `null` body when the step has no output data -
 * control-flow steps like If and Parallel, or a dynamic step not configured enough
 * to resolve (Run AI Agent with no agent chosen). Passed through as-is, that null
 * becomes missing structuredContent and the MCP client rejects the result, so it
 * is reported as an explicit "no output" result instead.
 */

import {
  withStandardDecorators,
  getApiClient,
  createToolResult,
  createToolResultError,
  CAPTURE_RAW_HTTP_RESPONSE,
  type ToolDefinition,
  type HttpResponse,
  type ProblemDetails,
} from "@umbraco-cms/mcp-server-sdk";
import { z } from "zod";
import { assertKnownSettingKeys } from "../../automations/_shared/settings-keys.js";
import { SETTINGS_KEYS_HELP } from "../../automations/_shared/step-settings.js";
import type { getUmbracoAutomateManagementAPI } from "../../../api/generated/umbracoAutomateManagementApi.js";
import { postCatalogueStepTypesByAliasOutputSchemaResponse } from "../../../api/generated/umbracoAutomateManagementApi.zod.js";

type ApiClient = ReturnType<typeof getUmbracoAutomateManagementAPI>;

const inputSchema = z.object({
  alias: z
    .string()
    .describe(
      "The step type alias to resolve, as returned by list-catalogue-actions, list-catalogue-control-flows, list-catalogue-triggers, or list-catalogue-step-types."
    ),
  settings: z
    .record(z.string(), z.unknown())
    .describe(
      `The step's configured settings, matching the shape described by that step type's settingsSchema, e.g. Form Submitted takes \`formIds\` (an array of form ids). ${SETTINGS_KEYS_HELP} Used to resolve a dynamic output schema when hasDynamicOutputSchema is true. An id that doesn't exist is not reported - it just adds nothing (a form that doesn't exist adds no fields), so check ids before relying on the result.`
    ),
});

const outputSchema = postCatalogueStepTypesByAliasOutputSchemaResponse;

const resolveStepTypeOutputSchemaTool = {
  name: "resolve-step-type-output-schema",
  description:
    "Computes the JSON schema of the data a configured step would output at runtime, for a given step type alias and settings. Use this when a catalogue entry has hasDynamicOutputSchema set to true, meaning its static outputSchema is not enough — the real output shape depends on how the step is configured (e.g. the columns returned by a database query action depend on the query itself). The resolved schema tells you what fields will be available for later steps in the automation to reference. If the step has no output for these settings, the result is { hasOutput: false, message } instead of a schema: control-flow steps like If and Parallel never output data, and a dynamic step returns this until it is configured enough to resolve (e.g. Run AI Agent before an agent is chosen). Read-only: no data is created or changed.",
  inputSchema: inputSchema.shape,
  outputSchema,
  slices: ["read"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async ({ alias, settings }) => {
    await assertKnownSettingKeys(alias, settings);
    const client = getApiClient<ApiClient>();
    const response = (await client.postCatalogueStepTypesByAliasOutputSchema(
      alias,
      { settings },
      CAPTURE_RAW_HTTP_RESPONSE
    )) as unknown as HttpResponse<ProblemDetails | Record<string, unknown> | null>;

    if (response.status >= 200 && response.status < 300) {
      if (response.data == null) {
        return createToolResult({
          hasOutput: false,
          message: `Step type "${alias}" has no output for these settings, so later steps have nothing from it to reference. Control-flow steps like If and Parallel never output data; a step whose output depends on its settings (e.g. Run AI Agent without an agent chosen) resolves once it is configured.`,
        });
      }
      return createToolResult(response.data);
    }

    const errorData: ProblemDetails = (response.data as ProblemDetails) || {
      status: response.status,
      detail: response.statusText,
    };
    return createToolResultError(errorData);
  },
} satisfies ToolDefinition<typeof inputSchema.shape, typeof outputSchema>;

export default withStandardDecorators(resolveStepTypeOutputSchemaTool);
