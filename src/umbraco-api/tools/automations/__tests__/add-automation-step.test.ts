import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  AutomationBuilder,
  WorkspaceBuilder,
  TEST_ACTION_ALIAS,
  TEST_ACTION_SETTINGS,
  TEST_STEP_ALIAS,
  TEST_TRIGGER_ALIAS,
} from "./setup.js";
import addAutomationStepTool from "../post/add-automation-step.js";
import getAutomationTool from "../get/get-automation.js";
import setAutomationTriggerTool from "../put/set-automation-trigger.js";
import { TRIGGER_STEP_ID } from "../_shared/automation-graph.js";

const TEST_WORKSPACE_ALIAS = "_testWsAuto_addStep";
const TEST_ALIAS = "_test_add_step_automation";

describe("add-automation-step", () => {
  setupTestEnvironment();

  let workspace: WorkspaceBuilder;
  let automation: AutomationBuilder;

  beforeAll(async () => {
    workspace = await new WorkspaceBuilder()
      .withAlias(TEST_WORKSPACE_ALIAS)
      .withName("_Test Workspace Auto Add Step")
      .create();
  });

  afterAll(async () => {
    await workspace.delete();
  });

  beforeEach(async () => {
    automation = await new AutomationBuilder()
      .withAlias(TEST_ALIAS)
      .withName("_Test Add Step Automation")
      .withWorkspaceId(workspace.getId())
      .create();
  });

  afterEach(async () => {
    await automation.delete();
  });

  it("should add a step to the automation's graph", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await addAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        actionAlias: TEST_ACTION_ALIAS,
        alias: TEST_STEP_ALIAS,
        name: "Delay Step",
        settings: TEST_ACTION_SETTINGS,
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      context,
    );

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as {
      message: string;
      stepId: string;
      alias: string;
    };
    expect(structured.stepId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect({ ...structured, stepId: "00000000-0000-0000-0000-000000000000" }).toMatchSnapshot();
  });

  it("should connect the first step to the trigger, as the backoffice canvas does", async () => {
    const context = createMockRequestHandlerExtra();
    await setAutomationTriggerTool.handler(
      { automationId: automation.getId(), triggerAlias: TEST_TRIGGER_ALIAS, settings: undefined },
      context,
    );

    const first = await addAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        actionAlias: TEST_ACTION_ALIAS,
        alias: TEST_STEP_ALIAS,
        name: "Delay Step",
        settings: TEST_ACTION_SETTINGS,
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      context,
    );
    expect(first.isError).toBeFalsy();
    const second = await addAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        actionAlias: TEST_ACTION_ALIAS,
        alias: "secondDelay",
        name: "Second Delay",
        settings: TEST_ACTION_SETTINGS,
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      context,
    );
    expect(second.isError).toBeFalsy();

    // Only the first step is wired to the trigger: wiring later ones too would make them
    // run off the trigger as well as after whatever step they are connected to next.
    const saved = await getAutomationTool.handler({ id: automation.getId() }, context);
    const { connections } = saved.structuredContent as {
      connections: { sourceStepId: string; targetStepId: string }[];
    };
    const firstStepId = (first.structuredContent as { stepId: string }).stepId;
    expect(connections).toEqual([
      expect.objectContaining({ sourceStepId: TRIGGER_STEP_ID, targetStepId: firstStepId }),
    ]);
  });

  it("should leave the first step unconnected when the automation has no trigger yet", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await addAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        actionAlias: TEST_ACTION_ALIAS,
        alias: TEST_STEP_ALIAS,
        name: "Delay Step",
        settings: TEST_ACTION_SETTINGS,
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      context,
    );
    expect(result.isError).toBeFalsy();

    const saved = await getAutomationTool.handler({ id: automation.getId() }, context);
    expect((saved.structuredContent as { connections: unknown[] }).connections).toEqual([]);
  });

  it("should save Switch cases in the PascalCase form the backoffice editor reads", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await addAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        actionAlias: "umbracoAutomate.switch",
        alias: "routeByInterest",
        name: "Route by interest",
        settings: {
          cases: [
            {
              name: "enterprise",
              conditions: {
                groups: [{ conditions: [{ leftOperand: "${trigger.name}", operator: "Contains", rightOperand: "Enterprise" }] }],
              },
            },
          ],
        },
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      context,
    );
    expect(result.isError).toBeFalsy();

    const saved = await getAutomationTool.handler({ id: automation.getId() }, context);
    const steps = (saved.structuredContent as { steps: { alias: string; settings: unknown }[] }).steps;
    expect(steps.find((s) => s.alias === "routeByInterest")?.settings).toEqual({
      cases: [
        {
          Name: "enterprise",
          Conditions: {
            Groups: [{ Conditions: [{ LeftOperand: "${trigger.name}", Operator: "Contains", RightOperand: "Enterprise" }] }],
          },
        },
      ],
    });
  });

  it("should refuse a settings key the step type does not have", async () => {
    const result = await addAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        actionAlias: "umbracoAutomate.delay",
        alias: "waitABit",
        name: "Wait a bit",
        settings: { wait: "00:00:05" },
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      createMockRequestHandlerExtra(),
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("duration");
  });

  it("should return an error when the alias is already used by another step", async () => {
    const context = createMockRequestHandlerExtra();

    const first = await addAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        actionAlias: TEST_ACTION_ALIAS,
        alias: TEST_STEP_ALIAS,
        name: "Delay Step",
        settings: TEST_ACTION_SETTINGS,
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      context,
    );
    expect(first.isError).toBeFalsy();

    const result = await addAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        actionAlias: TEST_ACTION_ALIAS,
        alias: TEST_STEP_ALIAS,
        name: "Delay Step Again",
        settings: TEST_ACTION_SETTINGS,
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      context,
    );

    expect(result.isError).toBe(true);
  });
});
