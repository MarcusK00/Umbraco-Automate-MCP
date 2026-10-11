import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import resolveStepTypeOutputSchemaTool from "../post/resolve-step-type-output-schema.js";

// Uses core Umbraco.Automate step types so the tests don't depend on add-on packages
// (Umbraco.AI's Run AI Agent) being installed on the instance.
describe("resolve-step-type-output-schema", () => {
  setupTestEnvironment();

  it("should refuse a settings key the step type does not have", async () => {
    const result = await resolveStepTypeOutputSchemaTool.handler(
      { alias: "umbracoAutomate.logMessage", settings: { text: "Hello" } },
      createMockRequestHandlerExtra()
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("message");
  });

  it("should resolve the output schema for a configured step", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await resolveStepTypeOutputSchemaTool.handler(
      {
        alias: "umbracoAutomate.logMessage",
        settings: { message: "Hello" },
      },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result)).toMatchSnapshot();
  });

  // The API answers 200 with a null body for a step with no output. That must come
  // back as structured content, or the MCP client rejects the whole result.
  it("should report no output for a step that outputs no data", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await resolveStepTypeOutputSchemaTool.handler(
      {
        alias: "umbracoAutomate.if",
        settings: {},
      },
      context
    );

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ hasOutput: false });
  });

  it("should return an error for an unknown step type alias", async () => {
    const context = createMockRequestHandlerExtra();

    const result = await resolveStepTypeOutputSchemaTool.handler(
      {
        alias: "umbracoAutomate.doesNotExist",
        settings: {},
      },
      context
    );

    expect(result.isError).toBe(true);
  });
});
