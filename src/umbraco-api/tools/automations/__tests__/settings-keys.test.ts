import { findUnknownSettingKeys } from "../_shared/settings-keys.js";

const fields = [{ key: "formIds" }, { key: "cronExpression" }, { key: "timeZone" }];

describe("findUnknownSettingKeys", () => {
  it("should accept keys the step type declares, in any case", () => {
    expect(findUnknownSettingKeys(fields, { formIds: [], CronExpression: "0 * * * *" })).toEqual([]);
  });

  it("should report a key the step type does not declare", () => {
    expect(findUnknownSettingKeys(fields, { colour: "red" })).toEqual([{ key: "colour" }]);
  });

  it("should suggest the declared key a near miss was meant to be", () => {
    expect(findUnknownSettingKeys(fields, { formId: "x", cron: "0 8 * * 1" })).toEqual([
      { key: "formId", suggestion: "formIds" },
      { key: "cron", suggestion: "cronExpression" },
    ]);
  });

  it("should report every key when the step type takes no settings", () => {
    expect(findUnknownSettingKeys(null, { anything: 1 })).toEqual([{ key: "anything" }]);
  });
});
