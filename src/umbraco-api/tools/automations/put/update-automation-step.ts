/**
 * Update Automation Step Tool
 *
 * Changes one existing step's own fields (settings, mappings, error
 * handling) without touching the rest of the automation's graph. To change
 * how steps connect to each other, use connect-automation-steps /
 * disconnect-automation-steps instead.
 */

import { z } from "zod";
import { withStandardDecorators, createToolResult, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import {
  fetchAutomation,
  toPutBody,
  saveAutomation,
  resolveStep,
  stripStepReadOnlyFields,
  applyAutoLayout,
} from "../_shared/automation-graph.js";
import {
  normalizeStepSettings,
  CONDITION_SETTINGS_HELP,
  SETTINGS_KEYS_HELP,
  STEP_VALUES_HELP,
} from "../_shared/step-settings.js";
import { assertKnownSettingKeys } from "../_shared/settings-keys.js";

const errorBehaviors = ["Retry", "Suspend", "Terminate", "Compensate"] as const;

const inputSchema = {
  automationId: z.string().uuid().describe("Id of the automation the step belongs to."),
  step: z
    .string()
    .min(1)
    .describe("The step to update, by its alias (preferred) or its step id, as seen in get-automation."),
  name: z.string().min(1).optional().describe("New display name, if changing it."),
  settings: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      `New configuration for the step, replacing its current settings entirely (not merged field-by-field). Match the shape from that step type's settingsSchema. Omit to leave settings unchanged. ${SETTINGS_KEYS_HELP} ${STEP_VALUES_HELP} ${CONDITION_SETTINGS_HELP}`
    ),
  inputMappings: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "New input mappings, replacing the current set entirely (not merged). Omit to leave mappings unchanged."
    ),
  errorBehavior: z
    .enum(errorBehaviors)
    .optional()
    .describe("New failure-handling behavior. Omit to leave unchanged."),
  retryInterval: z
    .string()
    .regex(/^-?(\d+\.)?\d{2}:\d{2}:\d{2}(\.\d{1,7})?$/)
    .nullish()
    .describe(
      "New retry delay as a d.hh:mm:ss duration string, only meaningful with errorBehavior Retry. Pass null to clear it. Omit to leave unchanged."
    ),
  maxRetries: z
    .number()
    .int()
    .nullish()
    .describe("New max retry count. Pass null to clear it. Omit to leave unchanged."),
};

type UpdateAutomationStepParams = {
  automationId: string;
  step: string;
  name?: string;
  settings?: Record<string, unknown>;
  inputMappings?: Record<string, string>;
  errorBehavior?: (typeof errorBehaviors)[number];
  retryInterval?: string | null;
  maxRetries?: number | null;
};

const outputSchema = z.object({ message: z.string() });

const updateAutomationStepTool = {
  name: "update-automation-step",
  description:
    "Updates one step's own configuration (name, settings, input mappings, error handling) by alias or id. Only the fields you provide are changed; everything else about the step, and the rest of the automation's steps/connections/trigger, is left as-is. `settings` and `inputMappings`, if provided, fully replace the step's current value for that field rather than merging - read get-automation first if you need to preserve part of an existing settings object while changing another part.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: {
    idempotentHint: true,
  },
  handler: async (params: UpdateAutomationStepParams) => {
    const automation = await fetchAutomation(params.automationId);
    const target = resolveStep(automation, params.step);
    await assertKnownSettingKeys(target.actionAlias, params.settings);

    const updatedSteps = automation.steps.map((step) => {
      const s = stripStepReadOnlyFields(step);
      if (s.id !== target.id) return s;
      return {
        ...s,
        name: params.name ?? s.name,
        settings: params.settings ? normalizeStepSettings(params.settings) : s.settings,
        inputMappings: params.inputMappings ?? s.inputMappings,
        errorBehavior: params.errorBehavior ?? s.errorBehavior,
        retryInterval: params.retryInterval !== undefined ? params.retryInterval : s.retryInterval,
        maxRetries: params.maxRetries !== undefined ? params.maxRetries : s.maxRetries,
      };
    });

    // A new name or settings can change the node's size and outputs (e.g. Switch cases),
    // so re-lay out when either changes.
    const relayout = params.name !== undefined || params.settings !== undefined;
    const body = relayout
      ? toPutBody(automation, await applyAutoLayout(automation, automation.connections, updatedSteps))
      : toPutBody(automation, { steps: updatedSteps });
    await saveAutomation(params.automationId, body);

    return createToolResult({ message: `Step "${params.step}" updated.` });
  },
} satisfies ToolDefinition<typeof inputSchema, typeof outputSchema>;

export default withStandardDecorators(updateAutomationStepTool);
