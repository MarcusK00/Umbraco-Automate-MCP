/**
 * Add Automation Step Tool
 *
 * Appends a new step to an automation's graph without requiring the caller
 * to construct or resend the rest of the definition. The step's id is
 * generated server-side; refer to the step afterwards by the `alias` you
 * gave it (in connect-automation-steps, update-automation-step,
 * remove-automation-step).
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  withStandardDecorators,
  createToolResult,
  type ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import type { StepConfigurationModel } from "../../../api/generated/umbracoAutomateManagementApi.js";
import {
  fetchAutomation,
  toPutBody,
  saveAutomation,
  stripStepReadOnlyFields,
  applyAutoLayout,
  TRIGGER_STEP_ID,
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
  automationId: z.string().uuid().describe("Id of the automation to add the step to."),
  actionAlias: z
    .string()
    .min(1)
    .describe(
      "Alias of the action or control-flow step type to use, as returned by list-catalogue-actions or list-catalogue-control-flows."
    ),
  alias: z
    .string()
    .min(1)
    .describe(
      "Unique name for this step within the automation. Letters and digits only, starting with a letter - no hyphens, underscores or spaces (e.g. 'sendWelcomeEmail'). Use this to refer to the step later in connect-automation-steps, update-automation-step, and remove-automation-step."
    ),
  name: z.string().min(1).describe("Human-readable display name for this step."),
  settings: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      `The step's configuration, matching the shape described by that step type's settingsSchema (see list-catalogue-actions/list-catalogue-control-flows). Defaults to an empty object if omitted. ${SETTINGS_KEYS_HELP} ${STEP_VALUES_HELP} ${CONDITION_SETTINGS_HELP}`
    ),
  inputMappings: z
    .record(z.string(), z.string())
    .optional()
    .describe(
      "Maps this step's input fields to expressions referencing earlier steps' output (e.g. trigger data or a prior step's result). Defaults to none if omitted - configure later with update-automation-step once you know what's available."
    ),
  errorBehavior: z
    .enum(errorBehaviors)
    .optional()
    .describe(
      "What happens if this step fails at runtime: Retry (per retryInterval/maxRetries), Suspend (pause the run for manual resume-run), Terminate (fail the run), or Compensate (run a compensating step). Defaults to Terminate."
    ),
  retryInterval: z
    .string()
    .regex(/^-?(\d+\.)?\d{2}:\d{2}:\d{2}(\.\d{1,7})?$/)
    .optional()
    .describe(
      "Delay before retrying, as a d.hh:mm:ss duration string (e.g. '00:05:00' for 5 minutes). Only meaningful when errorBehavior is Retry."
    ),
  maxRetries: z
    .number()
    .int()
    .optional()
    .describe("Maximum retry attempts before giving up. Only meaningful when errorBehavior is Retry."),
};

type AddAutomationStepParams = {
  automationId: string;
  actionAlias: string;
  alias: string;
  name: string;
  settings?: Record<string, unknown>;
  inputMappings?: Record<string, string>;
  errorBehavior?: (typeof errorBehaviors)[number];
  retryInterval?: string;
  maxRetries?: number;
};

const outputSchema = z.object({
  message: z.string(),
  stepId: z.string().uuid(),
  alias: z.string(),
});

const addAutomationStepTool = {
  name: "add-automation-step",
  description:
    "Adds a new step to an automation's graph. You only need to describe the new step - this tool reads the automation's current definition, appends the step, and saves it back, so nothing else is affected. If the automation has a trigger and no steps yet, the new step is connected to the trigger, so a one-step automation needs no connect-automation-steps call. Later steps are added unconnected: use connect-automation-steps to make each one run after another step (an unconnected step still runs directly off the trigger, but the backoffice canvas shows it detached). Canvas positions are assigned automatically (an unconnected step waits in a row below the graph until it is connected); use the Umbraco backoffice canvas to rearrange steps visually if needed.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: {
    idempotentHint: false,
  },
  handler: async (params: AddAutomationStepParams) => {
    await assertKnownSettingKeys(params.actionAlias, params.settings);
    const automation = await fetchAutomation(params.automationId);

    if (automation.steps.some((s) => s.alias === params.alias)) {
      throw new Error(
        `A step with alias "${params.alias}" already exists on this automation - step aliases must be unique. Choose a different alias, or use update-automation-step to modify the existing one.`
      );
    }

    const stepId = randomUUID();
    const newStep: StepConfigurationModel = {
      id: stepId,
      actionAlias: params.actionAlias,
      name: params.name,
      alias: params.alias,
      settings: normalizeStepSettings(params.settings ?? {}),
      inputMappings: params.inputMappings ?? {},
      position: { x: 0, y: 0 },
      errorBehavior: params.errorBehavior ?? "Terminate",
      retryInterval: params.retryInterval ?? null,
      maxRetries: params.maxRetries ?? null,
    };

    // The first step gets an explicit connection from the trigger, as the backoffice canvas
    // saves it. Automate runs an unconnected step off the trigger anyway, but the canvas only
    // draws the line for a saved connection. Later steps are left unconnected (the layout
    // parks them in the row below the graph) until connect-automation-steps places them.
    const connectToTrigger = automation.trigger != null && automation.steps.length === 0;
    const connections = connectToTrigger
      ? [
          ...automation.connections,
          {
            sourceStepId: TRIGGER_STEP_ID,
            sourceHandle: null,
            targetStepId: stepId,
            targetHandle: null,
            outcome: null,
            filter: null,
          },
        ]
      : automation.connections;
    const { steps, canvasState } = await applyAutoLayout(automation, connections, [
      ...automation.steps.map(stripStepReadOnlyFields),
      newStep,
    ]);
    const body = toPutBody(automation, { steps, connections, canvasState });
    await saveAutomation(params.automationId, body);

    return createToolResult({
      message: connectToTrigger
        ? `Step "${params.alias}" added and connected to the trigger.`
        : `Step "${params.alias}" added.`,
      stepId,
      alias: params.alias,
    });
  },
} satisfies ToolDefinition<typeof inputSchema, typeof outputSchema>;

export default withStandardDecorators(addAutomationStepTool);
