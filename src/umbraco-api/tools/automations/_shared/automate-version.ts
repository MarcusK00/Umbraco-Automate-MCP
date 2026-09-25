/**
 * Automate Version Gates
 *
 * Some Automate features arrived partway through a major line, and each major line got
 * them at its own minor: the 17.x and 18.x lines are released side by side, so 17.N
 * carries the same features as 18.N. A single "18.3 or later" check would wrongly refuse
 * a feature on Automate 17.4, so every gate looks up the minimum for the connected major.
 *
 * Minimums were read from the published Umbraco.Automate packages (runtime assemblies and
 * backoffice client sources) for every 17.x and 18.x release.
 */

import {
  UmbracoManagementClient,
  CAPTURE_RAW_HTTP_RESPONSE,
  type HttpResponse,
} from "@umbraco-cms/mcp-server-sdk";

/** The first Automate version with each feature, per major. */
export const AUTOMATE_FEATURE_MIN_VERSIONS = {
  /** A "done" output on While/ForEach/Parallel that runs once after the container. */
  containerDone: { 17: "17.3.0", 18: "18.3.0" },
  /** GET /automations/{id}/webhook-url. */
  webhookUrlEndpoint: { 17: "17.4.0", 18: "18.4.0" },
  /** TriggerItemResponseModel.supportsManualRun. */
  triggerSupportsManualRun: { 17: "17.4.0", 18: "18.4.0" },
} as const satisfies Record<string, Record<number, string>>;

export type AutomateFeature = keyof typeof AUTOMATE_FEATURE_MIN_VERSIONS;

type Version = [major: number, minor: number, patch: number];

function parseVersion(version: string | undefined): Version | undefined {
  const [major, minor, patch = 0] = (version ?? "").split(/[.+-]/).map(Number);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return undefined;
  return [major, minor, patch];
}

function compareVersions(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/**
 * Whether an Automate version has a feature. A major newer than any in the table has it;
 * an older one does not. An unreadable version is assumed to have it, so a missing
 * manifest entry never blocks a call.
 */
export function automateVersionSupports(feature: AutomateFeature, version: string | undefined): boolean {
  const installed = parseVersion(version);
  if (!installed) return true;

  const minimums: Record<number, string> = AUTOMATE_FEATURE_MIN_VERSIONS[feature];
  const minimum = parseVersion(minimums[installed[0]]);
  if (minimum) return compareVersions(installed, minimum) >= 0;

  const majors = Object.keys(minimums).map(Number);
  return installed[0] > Math.max(...majors);
}

/** "17.3 (Umbraco 17) or 18.3 (Umbraco 18)" - for messages about a feature's minimum. */
export function describeMinimumAutomateVersion(feature: AutomateFeature): string {
  return Object.entries(AUTOMATE_FEATURE_MIN_VERSIONS[feature] as Record<number, string>)
    .map(([major, version]) => `${version.replace(/\.0$/, "")} (Umbraco ${major})`)
    .join(" or ");
}

/** The installed Automate version, from the backoffice package manifest; undefined if it can't be read. */
export async function getAutomateVersion(): Promise<string | undefined> {
  try {
    const response = (await UmbracoManagementClient<{ id?: string; version?: string }[]>(
      { method: "GET", url: "/umbraco/management/api/v1/manifest/manifest" },
      CAPTURE_RAW_HTTP_RESPONSE,
    )) as unknown as HttpResponse<{ id?: string; version?: string }[]>;
    return response.data?.find?.((p) => p.id === "Umbraco.Automate")?.version;
  } catch {
    return undefined;
  }
}
