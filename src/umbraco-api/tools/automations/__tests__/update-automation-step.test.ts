import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  AutomationBuilder,
  WorkspaceBuilder,
  TEST_ACTION_ALIAS,
  TEST_ACTION_SETTINGS,
  TEST_STEP_ALIAS,
} from "./setup.js";
import addAutomationStepTool from "../post/add-automation-step.js";
import updateAutomationStepTool from "../put/update-automation-step.js";

const TEST_WORKSPACE_ALIAS = "_testWsAuto_updateStep";
const TEST_ALIAS = "_test_update_step_automation";

describe("update-automation-step", () => {
  setupTestEnvironment();

  let workspace: WorkspaceBuilder;
  let automation: AutomationBuilder;

  beforeAll(async () => {
    workspace = await new WorkspaceBuilder()
      .withAlias(TEST_WORKSPACE_ALIAS)
      .withName("_Test Workspace Auto Update Step")
      .create();
  });

  afterAll(async () => {
    await workspace.delete();
  });

  beforeEach(async () => {
    automation = await new AutomationBuilder()
      .withAlias(TEST_ALIAS)
      .withName("_Test Update Step Automation")
      .withWorkspaceId(workspace.getId())
      .create();

    const context = createMockRequestHandlerExtra();
    await addAutomationStepTool.handler(
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
  });

  afterEach(async () => {
    await automation.delete();
  });

  it("should update the step's settings by alias", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await updateAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        step: TEST_STEP_ALIAS,
        name: "Delay Step Updated",
        settings: { duration: "00:01:00" },
        inputMappings: undefined,
        errorBehavior: undefined,
        retryInterval: undefined,
        maxRetries: undefined,
      },
      context,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result)).toMatchSnapshot();
  });

  it("should refuse a settings key the step type does not have", async () => {
    const result = await updateAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        step: TEST_STEP_ALIAS,
        name: undefined,
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

  it("should return an error for an unknown step alias", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await updateAutomationStepTool.handler(
      {
        automationId: automation.getId(),
        step: "noSuchStep",
        name: undefined,
        settings: undefined,
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
