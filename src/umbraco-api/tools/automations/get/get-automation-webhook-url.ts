/**
 * Get Automation Webhook URL Tool
 *
 * Returns the inbound webhook URL for an automation that is triggered by an
 * incoming HTTP request. Only meaningful for automations whose trigger is
 * webhook-based - give this URL to the external system that should call it.
 *
 * The webhook-url endpoint only exists from Umbraco Automate 17.4 / 18.4 (see
 * AUTOMATE_FEATURE_MIN_VERSIONS). Older versions answer it with a bare 404 (no
 * problem details), while the public receiver at /automate/webhook/{id} works
 * the same on all of them, so on those versions the URL is derived instead of
 * failing.
 */

import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  UmbracoApiError,
  CAPTURE_RAW_HTTP_RESPONSE,
  getApiClient,
  type ToolDefinition,
  type HttpResponse,
} from "@umbraco-cms/mcp-server-sdk";
import type { getUmbracoAutomateManagementAPI } from "../../../api/generated/umbracoAutomateManagementApi.js";
import {
  getAutomationsByIdWebhookUrlParams,
  getAutomationsByIdWebhookUrlResponse,
} from "../../../api/generated/umbracoAutomateManagementApi.zod.js";
import { getUmbracoBaseUrl } from "../../../../config/umbraco-base-url.js";
import { describeMinimumAutomateVersion } from "../_shared/automate-version.js";

type ApiClient = ReturnType<typeof getUmbracoAutomateManagementAPI>;

const inputSchema = {
  ...getAutomationsByIdWebhookUrlParams.shape,
  id: getAutomationsByIdWebhookUrlParams.shape.id.describe(
    "Id of the automation (from list-automations or create-automation).",
  ),
};

const outputSchema = getAutomationsByIdWebhookUrlResponse.extend({
  note: z
    .string()
    .optional()
    .describe("Present when the URL was derived rather than reported by Umbraco."),
});

const WEBHOOK_RECEIVER_PATH = "/automate/webhook";

// A missing route 404s with no problem-details body; a missing automation 404s with one.
const isMissingEndpoint = (response: HttpResponse) =>
  response.status === 404 &&
  !(response.data && typeof response.data === "object" && "title" in response.data);

const throwApiError = (response: HttpResponse): never => {
  throw new UmbracoApiError(
    (response.data as Record<string, unknown> | undefined) || {
      status: response.status,
      detail: response.statusText,
    },
  );
};

const getAutomationWebhookUrlTool = {
  name: "get-automation-webhook-url",
  description:
    "Gets the inbound webhook URL for an automation whose trigger is webhook-based. Share this URL with the external system that should invoke the automation. For automations with a different trigger type, this endpoint is not meaningful.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: {
    readOnlyHint: true,
  },
  handler: async ({ id }) => {
    const client = getApiClient<ApiClient>();
    const response = (await client.getAutomationsByIdWebhookUrl(
      id,
      CAPTURE_RAW_HTTP_RESPONSE,
    )) as unknown as HttpResponse<z.infer<typeof getAutomationsByIdWebhookUrlResponse>>;

    if (response.status === 200) {
      return createToolResult(response.data);
    }
    if (!isMissingEndpoint(response)) {
      return throwApiError(response);
    }

    // No endpoint: confirm the automation exists so an unknown id still errors as it does with one.
    const automation = (await client.getAutomationsById(
      id,
      CAPTURE_RAW_HTTP_RESPONSE,
    )) as unknown as HttpResponse;
    if (automation.status !== 200) {
      return throwApiError(automation);
    }

    const path = `${WEBHOOK_RECEIVER_PATH}/${id}`;
    const baseUrl = getUmbracoBaseUrl();
    const versionNote = `this Umbraco Automate version does not report webhook URLs (that needs ${describeMinimumAutomateVersion("webhookUrlEndpoint")}).`;
    return createToolResult({
      url: baseUrl ? `${baseUrl}${path}` : path,
      note: baseUrl
        ? `Derived from the configured Umbraco base URL: ${versionNote} If the site's public domain differs from that base URL, use the public domain instead.`
        : `Path relative to the Umbraco site's public URL: ${versionNote}`,
    });
  },
} satisfies ToolDefinition<typeof inputSchema, typeof outputSchema>;

export default withStandardDecorators(getAutomationWebhookUrlTool);
