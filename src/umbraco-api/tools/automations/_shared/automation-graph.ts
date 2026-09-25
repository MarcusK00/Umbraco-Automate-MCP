/**
 * Automation Graph Helpers
 *
 * Shared internals for the step/connection/trigger composite tools
 * (add-automation-step, update-automation-step, remove-automation-step,
 * connect-automation-steps, disconnect-automation-steps,
 * set-automation-trigger) and the metadata-only update-automation tool.
 *
 * The Automate Management API only exposes a full-replace PUT for an
 * automation's definition (trigger + steps + connections + canvasState +
 * notificationSettings + version, all-or-nothing with optimistic
 * concurrency). Asking an LLM to author that whole body by hand - inventing
 * step UUIDs, wiring sourceStepId/targetStepId references, matching a
 * regex-constrained retryInterval duration string, and round-tripping a
 * version number - is exactly the anti-pattern the MCP tool review flagged.
 *
 * These helpers hide that round trip: every composite tool does an internal
 * get-automation, mutates just the piece it owns, and PUTs the result back
 * with the version it just read. This does not eliminate the API's
 * optimistic-concurrency check (a genuine concurrent edit still fails), it
 * just stops the LLM from having to manage it by hand for routine graph
 * edits.
 */

import {
  getApiClient,
  UmbracoApiError,
  ToolValidationError,
  CAPTURE_RAW_HTTP_RESPONSE,
  type HttpResponse,
  type ProblemDetails,
} from "@umbraco-cms/mcp-server-sdk";
import type {
  getUmbracoAutomateManagementAPI,
  AutomationResponseModel,
  UpdateAutomationRequestModel,
  StepConfigurationModel,
  StepConnectionModel,
} from "../../../api/generated/umbracoAutomateManagementApi.js";
import { computeCanvasLayout, type CanvasLayoutOptions, type TriggerLabel } from "./canvas-layout.js";
import { APPROVAL_ALIAS } from "./step-outputs.js";
import { automateVersionSupports, getAutomateVersion } from "./automate-version.js";

export type ApiClient = ReturnType<typeof getUmbracoAutomateManagementAPI>;

/** Fetches the current full definition of an automation, throwing an actionable error on failure. */
export async function fetchAutomation(id: string): Promise<AutomationResponseModel> {
  const client = getApiClient<ApiClient>();
  const response = (await client.getAutomationsById(
    id,
    CAPTURE_RAW_HTTP_RESPONSE
  )) as unknown as HttpResponse<AutomationResponseModel | ProblemDetails>;

  if (response.status < 200 || response.status >= 300) {
    throw new UmbracoApiError(
      (response.data as ProblemDetails) ?? {
        status: response.status,
        detail: response.statusText,
      }
    );
  }
  return response.data as AutomationResponseModel;
}

/**
 * Builds the full PUT body from a freshly-fetched automation, applying the
 * given overrides on top. Anything not overridden is copied through as-is,
 * so callers only need to specify the piece of the graph they're changing.
 */
export function toPutBody(
  automation: AutomationResponseModel,
  overrides: Partial<UpdateAutomationRequestModel> = {}
): UpdateAutomationRequestModel {
  return {
    alias: automation.alias,
    name: automation.name,
    description: automation.description ?? null,
    groupId: automation.groupId ?? null,
    trigger: automation.trigger ?? null,
    steps: automation.steps.map(stripStepReadOnlyFields),
    connections: automation.connections,
    canvasState: automation.canvasState ?? null,
    notificationSettings: automation.notificationSettings ?? null,
    version: automation.version,
    ...overrides,
  };
}

// The GET response's step shape includes `connectionId` (which connection
// created this step, for steps that call another automation) - the PUT
// body's step shape doesn't accept it back, so it must be dropped when
// round-tripping steps read from GET into a PUT body.
export function stripStepReadOnlyFields(step: StepConfigurationModel): StepConfigurationModel {
  const { connectionId: _connectionId, ...rest } = step;
  return rest;
}

/**
 * Saves a full PUT body back to the automation. Throws on any non-2xx
 * response. A 409/412 means the automation was changed by someone else
 * since it was read (optimistic concurrency) - every composite tool built
 * on this helper re-fetches fresh state on each call, so simply retrying
 * the same tool call is a safe and sufficient fix, and the resulting error
 * says so explicitly rather than surfacing a raw HTTP status.
 */
export async function saveAutomation(
  id: string,
  body: UpdateAutomationRequestModel
): Promise<void> {
  const client = getApiClient<ApiClient>();
  const response = (await client.putAutomationsById(
    id,
    body,
    CAPTURE_RAW_HTTP_RESPONSE
  )) as unknown as HttpResponse<ProblemDetails | void>;

  if (response.status === 409 || response.status === 412) {
    throw new ToolValidationError({
      title: "Automation changed since it was read",
      status: response.status,
      detail:
        "This automation was modified by someone else between reading it and saving this change (optimistic concurrency conflict). Call this tool again with the same arguments - it will re-read the current definition and retry automatically.",
    });
  }

  if (response.status < 200 || response.status >= 300) {
    throw new UmbracoApiError(
      (response.data as ProblemDetails) ?? {
        status: response.status,
        detail: response.statusText,
      }
    );
  }
}

/**
 * Resolves a caller-supplied step reference (its `alias`, or its raw step
 * id) to the actual step. Steps are matched by alias first since that's the
 * stable, human-chosen name; the id is also accepted since it's what
 * get-automation/list results show for a step that has no alias set.
 */
export function resolveStep(
  automation: AutomationResponseModel,
  ref: string
): StepConfigurationModel {
  const byAlias = automation.steps.find((s) => s.alias === ref);
  if (byAlias) return byAlias;

  const byId = automation.steps.find((s) => s.id === ref);
  if (byId) return byId;

  const known = automation.steps
    .map((s) => s.alias ?? s.id)
    .join(", ") || "(no steps yet)";
  throw new ToolValidationError({
    title: "Step not found",
    detail: `No step with alias or id "${ref}" exists on this automation. Known steps: ${known}. Call get-automation to see the current step list.`,
  });
}

// The API represents "runs directly off the trigger" as a connection whose
// sourceStepId is this all-zero sentinel - it doesn't appear in `steps` (the
// trigger isn't a step), so resolveStep alone can never match it. Every
// automation actually wired up in the backoffice canvas has a connection
// shaped this way for its first step(s).
export const TRIGGER_STEP_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Resolves a connection *source* reference, which - unlike a plain step
 * reference - may also mean "the automation's trigger". Callers pass the
 * literal keyword "trigger" (case-insensitive) or the trigger sentinel id
 * to connect a step directly off the trigger; anything else is resolved as
 * a normal step via resolveStep. Only sources may refer to the trigger - a
 * connection's target is always a real step.
 */
export function resolveConnectionSource(
  automation: AutomationResponseModel,
  ref: string
): { id: string } {
  if (ref === TRIGGER_STEP_ID || ref.trim().toLowerCase() === "trigger") {
    if (!automation.trigger) {
      throw new ToolValidationError({
        title: "No trigger configured",
        detail: `"${ref}" refers to the automation's trigger, but this automation has no trigger set yet. Call set-automation-trigger first.`,
      });
    }
    return { id: TRIGGER_STEP_ID };
  }
  return resolveStep(automation, ref);
}

/**
 * How the canvas labels each trigger type, from the catalogue: its name (the canvas
 * falls back to the alias) and whether it has settings (which adds an edit button).
 * The layout needs both to know the trigger node's width. They are product-defined per
 * alias, so they are cached for the life of the process instead of re-reading the
 * catalogue on every save.
 */
const triggerLabels = new Map<string, TriggerLabel>();

async function getTriggerLabel(alias: string): Promise<TriggerLabel> {
  if (!triggerLabels.has(alias)) {
    try {
      const client = getApiClient<ApiClient>();
      const response = (await client.getCatalogueTriggers(
        undefined,
        CAPTURE_RAW_HTTP_RESPONSE
      )) as unknown as HttpResponse<{ alias: string; name: string; settingsSchema?: { fields?: unknown[] } | null }[]>;
      if (response.status === 200) {
        for (const t of response.data ?? []) {
          triggerLabels.set(t.alias, { name: t.name, hasSettings: (t.settingsSchema?.fields?.length ?? 0) > 0 });
        }
      }
    } catch {
      // Fall back below, as the canvas does.
    }
  }
  return triggerLabels.get(alias) ?? { name: alias, hasSettings: true };
}

/** Positions for the given steps and connections; see canvas-layout.ts. */
export function computeAutoLayout(
  steps: StepConfigurationModel[],
  connections: StepConnectionModel[],
  triggerLabel: TriggerLabel = { name: "", hasSettings: true },
  options: CanvasLayoutOptions = {}
): { stepPositions: Record<string, { x: number; y: number }>; triggerPosition: { x: number; y: number } } {
  return computeCanvasLayout(steps, connections, triggerLabel, options);
}

/**
 * Lays out an automation for a (possibly about-to-be-saved) set of steps and
 * connections, returning ready-to-use `steps` and `canvasState` overrides for
 * toPutBody. Any existing canvas viewport is preserved - only step positions and the
 * trigger's canvas position change. `steps` defaults to the automation's current steps.
 */
export async function applyAutoLayout(
  automation: AutomationResponseModel,
  connections: StepConnectionModel[],
  steps: StepConfigurationModel[] = automation.steps
): Promise<{ steps: StepConfigurationModel[]; canvasState: string }> {
  const triggerLabel = automation.trigger
    ? await getTriggerLabel(automation.trigger.triggerAlias)
    : { name: "", hasSettings: true };
  // Only an approval step's node shape depends on the Automate version.
  const approvalOutcomes = steps.some((s) => s.actionAlias === APPROVAL_ALIAS)
    ? automateVersionSupports("approvalOutcomes", await getAutomateVersion())
    : true;
  const { stepPositions, triggerPosition } = computeAutoLayout(steps, connections, triggerLabel, { approvalOutcomes });

  const laidOut = steps.map((s) => ({
    ...stripStepReadOnlyFields(s),
    position: stepPositions[s.id] ?? s.position,
  }));

  let canvas: Record<string, unknown> = {};
  if (automation.canvasState) {
    try {
      canvas = JSON.parse(automation.canvasState) as Record<string, unknown>;
    } catch {
      canvas = {};
    }
  }
  canvas.triggerPosition = triggerPosition;

  return { steps: laidOut, canvasState: JSON.stringify(canvas) };
}
