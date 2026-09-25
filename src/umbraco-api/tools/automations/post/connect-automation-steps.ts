/**
 * Connect Automation Steps Tool
 *
 * Wires one step's output to another step's input. A step with no incoming
 * connection runs directly off the trigger; every other step only runs once
 * something connects into it. Use add-automation-step first to create the
 * steps, then this tool to link them into a flow.
 */

import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolValidationError, type ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { fetchAutomation, toPutBody, saveAutomation, resolveStep, resolveConnectionSource, applyAutoLayout, TRIGGER_STEP_ID } from "../_shared/automation-graph.js";
import {
  resolveConnectionOutput,
  isSingleConnectionOutput,
  DONE_HANDLE,
  OUTCOME_HELP,
} from "../_shared/step-outputs.js";
import {
  automateVersionSupports,
  describeMinimumAutomateVersion,
  getAutomateVersion,
  minimumAutomateVersion,
} from "../_shared/automate-version.js";

const operators = [
  "Equals",
  "NotEquals",
  "Contains",
  "NotContains",
  "StartsWith",
  "EndsWith",
  "GreaterThan",
  "LessThan",
  "GreaterThanOrEquals",
  "LessThanOrEquals",
  "IsEmpty",
  "IsNotEmpty",
] as const;

const conditionSchema = z.object({
  leftOperand: z
    .string()
    .describe("Expression to test, e.g. a reference to the source step's output or trigger data."),
  operator: z.enum(operators),
  rightOperand: z
    .string()
    .describe("Value to compare against. Ignored for IsEmpty/IsNotEmpty but still required by the API - pass an empty string."),
});

const inputSchema = {
  automationId: z.string().uuid().describe("Id of the automation to connect steps within."),
  sourceStep: z
    .string()
    .min(1)
    .describe(
      "The step this connection runs from, by alias (preferred) or step id. Pass the literal \"trigger\" to run this step directly off the automation's trigger instead of another step."
    ),
  targetStep: z
    .string()
    .min(1)
    .describe("The step this connection runs to, by alias (preferred) or step id."),
  outcome: z.string().optional().describe(OUTCOME_HELP),
  conditions: z
    .array(conditionSchema)
    .optional()
    .describe(
      "Optional list of conditions that must ALL be true (AND) for this connection to be followed - use this for a conditional path off a branching step. Omit for an unconditional connection. This tool only supports a single AND-group; for the rarer OR-of-AND case, build the connection through the Umbraco backoffice canvas instead."
    ),
};

type ConnectAutomationStepsParams = {
  automationId: string;
  sourceStep: string;
  targetStep: string;
  outcome?: string;
  conditions?: { leftOperand: string; operator: (typeof operators)[number]; rightOperand: string }[];
};

const outputSchema = z.object({ message: z.string() });

const connectAutomationStepsTool = {
  name: "connect-automation-steps",
  description:
    "Connects one step's output to another step's input, so the target step runs after the source step (optionally only for a specific outcome, and/or only when conditions are met). The target step must already exist on the automation - use add-automation-step first. Connections from a branching step (If, Switch, Request Approval, While, ForEach, Parallel) must name the output via `outcome`. Pass sourceStep: \"trigger\" to run the target step directly off the automation's trigger instead of another step. Adding a connection does not remove any existing connections between other steps. Also re-lays out every step's canvas position top-down by distance from the trigger, so the graph reads as a flow instead of piling up wherever add-automation-step happened to place it.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: {
    idempotentHint: false,
  },
  handler: async (params: ConnectAutomationStepsParams) => {
    const automation = await fetchAutomation(params.automationId);
    const source = resolveConnectionSource(automation, params.sourceStep);
    const target = resolveStep(automation, params.targetStep);
    const sourceStep = source.id === TRIGGER_STEP_ID ? undefined : resolveStep(automation, source.id);
    const output = resolveConnectionOutput(sourceStep, params.outcome);

    if (sourceStep && output.sourceHandle === DONE_HANDLE) {
      // Before the "done" output existed every connection from a container was part of its
      // body, so a "done" connection would silently run inside the loop instead of after it.
      const automateVersion = await getAutomateVersion();
      if (!automateVersionSupports("containerDone", automateVersion)) {
        throw new ToolValidationError({
          title: "Not supported by this Automate version",
          detail: `This Umbraco Automate version (${automateVersion}) has no "done" output on ${sourceStep.actionAlias} steps - every connection from it runs inside the loop. Connect the step with outcome "body" to run it on each iteration, or upgrade Umbraco Automate to ${minimumAutomateVersion("containerDone", automateVersion) ?? describeMinimumAutomateVersion("containerDone")} or later to run steps after the loop.`,
        });
      }
    }

    if (
      sourceStep &&
      output.sourceHandle &&
      isSingleConnectionOutput(sourceStep, output.sourceHandle) &&
      automation.connections.some((c) => c.sourceStepId === source.id && c.sourceHandle === output.sourceHandle)
    ) {
      throw new ToolValidationError({
        title: "Output already connected",
        detail: `"${params.sourceStep}" already has a step on its "${output.sourceHandle}" output, and only the first one would ever run. Chain further steps after that step instead, or disconnect-automation-steps it first.`,
      });
    }

    const alreadyConnected = automation.connections.some(
      (c) =>
        c.sourceStepId === source.id &&
        c.targetStepId === target.id &&
        (c.outcome ?? null) === output.outcome &&
        (c.sourceHandle ?? null) === output.sourceHandle
    );
    if (alreadyConnected) {
      throw new Error(
        `A connection from "${params.sourceStep}" to "${params.targetStep}"${
          output.outcome ? ` for outcome "${output.outcome}"` : ""
        } already exists - use disconnect-automation-steps first if you need to replace it (e.g. with different conditions).`
      );
    }

    const newConnection = {
      sourceStepId: source.id,
      sourceHandle: output.sourceHandle,
      targetStepId: target.id,
      targetHandle: null,
      outcome: output.outcome,
      filter: params.conditions?.length
        ? { groups: [{ conditions: params.conditions }] }
        : null,
    };

    const newConnections = [...automation.connections, newConnection];
    const { steps, canvasState } = await applyAutoLayout(automation, newConnections);

    const body = toPutBody(automation, {
      connections: newConnections,
      steps,
      canvasState,
    });
    await saveAutomation(params.automationId, body);

    return createToolResult({
      message: `Connected "${params.sourceStep}"${output.outcome ? ` (${output.outcome})` : ""} -> "${params.targetStep}".`,
    });
  },
} satisfies ToolDefinition<typeof inputSchema, typeof outputSchema>;

export default withStandardDecorators(connectAutomationStepsTool);
