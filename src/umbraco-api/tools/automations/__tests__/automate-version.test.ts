import {
  automateVersionSupports,
  describeMinimumAutomateVersion,
  minimumAutomateVersion,
} from "../_shared/automate-version.js";

describe("automateVersionSupports", () => {
  it("should gate the container done output at 17.3 on the 17.x line", () => {
    expect(automateVersionSupports("containerDone", "17.0.0")).toBe(false);
    expect(automateVersionSupports("containerDone", "17.2.0")).toBe(false);
    expect(automateVersionSupports("containerDone", "17.3.0")).toBe(true);
    expect(automateVersionSupports("containerDone", "17.4.0")).toBe(true);
  });

  it("should gate the container done output at 18.3 on the 18.x line", () => {
    expect(automateVersionSupports("containerDone", "18.2.0")).toBe(false);
    expect(automateVersionSupports("containerDone", "18.3.0")).toBe(true);
    expect(automateVersionSupports("containerDone", "18.4.0")).toBe(true);
  });

  it("should judge each major by its own minimum, not by the newest line's", () => {
    // 17.4 is below 18.3 numerically but has every 18.3 feature.
    expect(automateVersionSupports("containerDone", "17.4.0")).toBe(true);
    expect(automateVersionSupports("webhookUrlEndpoint", "17.4.0")).toBe(true);
    expect(automateVersionSupports("webhookUrlEndpoint", "17.3.0")).toBe(false);
    expect(automateVersionSupports("webhookUrlEndpoint", "18.3.0")).toBe(false);
  });

  it("should read build metadata and prerelease suffixes", () => {
    expect(automateVersionSupports("containerDone", "17.3.0+6323387")).toBe(true);
    expect(automateVersionSupports("containerDone", "17.2.0-rc1")).toBe(false);
  });

  it("should treat majors outside the table by which side of it they fall", () => {
    expect(automateVersionSupports("containerDone", "19.0.0")).toBe(true);
    expect(automateVersionSupports("containerDone", "16.5.0")).toBe(false);
  });

  it("should assume support when the version can't be read", () => {
    expect(automateVersionSupports("containerDone", undefined)).toBe(true);
    expect(automateVersionSupports("containerDone", "")).toBe(true);
    expect(automateVersionSupports("containerDone", "unknown")).toBe(true);
  });
});

describe("minimumAutomateVersion", () => {
  it("should name the minimum on the installed version's own line", () => {
    expect(minimumAutomateVersion("containerDone", "17.0.0")).toBe("17.3");
    expect(minimumAutomateVersion("containerDone", "18.2.0")).toBe("18.3");
    expect(minimumAutomateVersion("webhookUrlEndpoint", "17.1.0")).toBe("17.4");
  });

  it("should return undefined for a major outside the table or an unreadable version", () => {
    expect(minimumAutomateVersion("containerDone", "16.5.0")).toBeUndefined();
    expect(minimumAutomateVersion("containerDone", undefined)).toBeUndefined();
  });
});

describe("describeMinimumAutomateVersion", () => {
  it("should name the minimum on every line", () => {
    expect(describeMinimumAutomateVersion("containerDone")).toBe("17.3+ (Umbraco 17) / 18.3+ (Umbraco 18)");
    expect(describeMinimumAutomateVersion("webhookUrlEndpoint")).toBe("17.4+ (Umbraco 17) / 18.4+ (Umbraco 18)");
  });
});
