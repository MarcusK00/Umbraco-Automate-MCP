import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  AutomationBuilder,
  AutomationTestHelper,
  WorkspaceBuilder,
} from "./setup.js";
import getAutomationWebhookUrlTool from "../get/get-automation-webhook-url.js";

const TEST_WORKSPACE_ALIAS = "_testWsAuto_webhookUrl";
const TEST_ALIAS = "_test_webhook_url_automation";

describe("get-automation-webhook-url", () => {
  setupTestEnvironment();

  let workspace: WorkspaceBuilder;
  let automation: AutomationBuilder;

  beforeAll(async () => {
    workspace = await new WorkspaceBuilder()
      .withAlias(TEST_WORKSPACE_ALIAS)
      .withName("_Test Workspace Auto Webhook Url")
      .create();
  });

  afterAll(async () => {
    await workspace.delete();
  });

  afterEach(async () => {
    if (automation) await automation.delete();
  });

  it("should return the inbound webhook URL for an automation", async () => {
    const context = createMockRequestHandlerExtra();
    automation = await new AutomationBuilder()
      .withAlias(TEST_ALIAS)
      .withName("_Test Webhook Url Automation")
      .withWorkspaceId(workspace.getId())
      .create();

    const result = await getAutomationWebhookUrlTool.handler(
      { id: automation.getId() },
      context,
    );

    expect(result.isError).toBeFalsy();
    const snapshot = createSnapshotResult(result);
    const structuredContent = snapshot.structuredContent as { url: string; note?: string };
    // Automate before 17.4 / 18.4 has no webhook-url endpoint, so the tool derives the URL and says so in
    // `note`; the URL itself is the same on every version, so only `note` is left out here.
    expect(structuredContent.url).toBe(
      `${process.env.UMBRACO_BASE_URL?.replace(/\/+$/, "")}/automate/webhook/${automation.getId()}`,
    );
    delete structuredContent.note;
    expect(AutomationTestHelper.normalizeIds(snapshot)).toMatchSnapshot();
  });

  it("should return an error for a non-existent id", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await getAutomationWebhookUrlTool.handler(
      { id: "00000000-0000-0000-0000-000000000000" },
      context,
    );

    expect(result.isError).toBe(true);
  });
});
