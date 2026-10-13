import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  AutomationBuilder,
  WorkspaceBuilder,
  TEST_TRIGGER_ALIAS,
} from "./setup.js";
import setAutomationTriggerTool from "../put/set-automation-trigger.js";

const TEST_WORKSPACE_ALIAS = "_testWsAuto_setTrigger";
const TEST_ALIAS = "_test_set_trigger_automation";

describe("set-automation-trigger", () => {
  setupTestEnvironment();

  let workspace: WorkspaceBuilder;
  let automation: AutomationBuilder;

  beforeAll(async () => {
    workspace = await new WorkspaceBuilder()
      .withAlias(TEST_WORKSPACE_ALIAS)
      .withName("_Test Workspace Auto Set Trigger")
      .create();
  });

  afterAll(async () => {
    await workspace.delete();
  });

  beforeEach(async () => {
    automation = await new AutomationBuilder()
      .withAlias(TEST_ALIAS)
      .withName("_Test Set Trigger Automation")
      .withWorkspaceId(workspace.getId())
      .create();
  });

  afterEach(async () => {
    await automation.delete();
  });

  it("should set the automation's trigger", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await setAutomationTriggerTool.handler(
      {
        automationId: automation.getId(),
        triggerAlias: TEST_TRIGGER_ALIAS,
        settings: undefined,
      },
      context,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result)).toMatchSnapshot();
  });

  it("should clear the trigger when triggerAlias is omitted", async () => {
    const context = createMockRequestHandlerExtra();

    // First set a trigger so clearing it is a real change, not a no-op.
    await setAutomationTriggerTool.handler(
      {
        automationId: automation.getId(),
        triggerAlias: TEST_TRIGGER_ALIAS,
        settings: undefined,
      },
      context,
    );

    const result = await setAutomationTriggerTool.handler(
      { automationId: automation.getId(), triggerAlias: undefined, settings: undefined },
      context,
    );

    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { message: string };
    expect(structured.message).toBe("Trigger cleared.");
  });

  it("should refuse a settings key the trigger type does not have", async () => {
    const result = await setAutomationTriggerTool.handler(
      {
        automationId: automation.getId(),
        triggerAlias: "umbracoAutomate.scheduled",
        settings: { cron: "0 8 * * 1" },
      },
      createMockRequestHandlerExtra(),
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("cronExpression");
  });

  it("should return an error for a non-existent automationId", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await setAutomationTriggerTool.handler(
      {
        automationId: "00000000-0000-0000-0000-000000000000",
        triggerAlias: TEST_TRIGGER_ALIAS,
        settings: undefined,
      },
      context,
    );

    expect(result.isError).toBe(true);
  });
});
