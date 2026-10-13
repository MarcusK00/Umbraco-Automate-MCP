/**
 * Publish Automation Tool
 *
 * Publishes the current draft version of an automation, making it live so its
 * trigger becomes active. Has a real side effect: once published, the
 * automation's trigger can fire and start runs. Use unpublish-automation to
 * take it offline again, or re-enable-automation if it was auto-disabled.
 */

import {
  withStandardDecorators,
  executeVoidApiCall,
  CAPTURE_RAW_HTTP_RESPONSE,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import type { getUmbracoAutomateManagementAPI } from "../../../api/generated/umbracoAutomateManagementApi.js";
import { postAutomationsByIdPublishParams } from "../../../api/generated/umbracoAutomateManagementApi.zod.js";

type ApiClient = ReturnType<typeof getUmbracoAutomateManagementAPI>;

const inputSchema = {
  ...postAutomationsByIdPublishParams.shape,
  id: postAutomationsByIdPublishParams.shape.id.describe(
    "Id of the automation to publish. It must already have a trigger and at least one step.",
  ),
};

const publishAutomationTool = {
  name: "publish-automation",
  description:
    "Publishes an automation, making its current version live. This activates the trigger so the automation can start running for real - only use when the automation's trigger, steps and connections are ready. Publishing checks that a trigger is set, the workspace's service account, allowed connections and section access, and that `${steps.…}` bindings name existing steps. It does not check ids inside settings (forms, document types, content), `${trigger.…}` field names or setting values - mistakes there only show up when a run fails. An automation's `health` reflects the error rate of its runs, not whether its configuration is valid. Use unpublish-automation to stop it from running without deleting it.",
  inputSchema,
  slices: ["publish"],
  annotations: {
    idempotentHint: true,
  },
  handler: async ({ id }) => {
    return executeVoidApiCall<ApiClient>((client) =>
      client.postAutomationsByIdPublish(id, CAPTURE_RAW_HTTP_RESPONSE),
    );
  },
} satisfies ToolDefinition<typeof inputSchema>;

export default withStandardDecorators(publishAutomationTool);
