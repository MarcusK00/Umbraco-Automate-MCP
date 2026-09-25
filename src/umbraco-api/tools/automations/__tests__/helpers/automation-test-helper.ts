import { getUmbracoAutomateManagementAPI } from "../../../../api/generated/umbracoAutomateManagementApi.js";
import { CAPTURE_RAW_HTTP_RESPONSE, normalizeBaseUrl, type HttpResponse } from "@umbraco-cms/mcp-server-sdk";
import type { AutomationItemResponseModel } from "../../../../api/generated/umbracoAutomateManagementApi.js";

export class AutomationTestHelper {
  // NOTE: an automation's `alias` is unique GLOBALLY (a single DB unique index across every
  // workspace), not scoped per workspace - confirmed against the real instance (a second
  // postAutomations with the same alias, even in a different/nonexistent workspace, 500s on
  // a unique-constraint violation). So lookups/cleanup here deliberately do NOT scope by
  // workspaceId - a leftover from a failed run in any workspace would otherwise still block
  // recreating the same alias.
  static async findByAlias(alias: string): Promise<AutomationItemResponseModel | undefined> {
    const client = getUmbracoAutomateManagementAPI();
    const response = (await client.getAutomations(
      { filter: alias, skip: 0, take: 100 },
      CAPTURE_RAW_HTTP_RESPONSE,
    )) as unknown as HttpResponse<{ items: AutomationItemResponseModel[] }>;

    return response.data?.items?.find((item) => item.alias === alias);
  }

  /** Deletes every automation whose alias starts with the given prefix, in any workspace. */
  static async cleanup(aliasPrefix: string): Promise<void> {
    const client = getUmbracoAutomateManagementAPI();
    const response = (await client.getAutomations(
      { filter: aliasPrefix, skip: 0, take: 100 },
      CAPTURE_RAW_HTTP_RESPONSE,
    )) as unknown as HttpResponse<{ items: AutomationItemResponseModel[] }>;

    const matches = (response.data?.items ?? []).filter((item) =>
      item.alias.startsWith(aliasPrefix),
    );

    for (const match of matches) {
      try {
        await client.deleteAutomationsById(match.id, CAPTURE_RAW_HTTP_RESPONSE);
      } catch {
        // Ignore delete failures in cleanup
      }
    }
  }

  /**
   * createSnapshotResult (from the SDK testing helpers) only normalizes a fixed list of date
   * field names (created, createDate, publishDate, ...) which doesn't include this
   * collection's dateCreated/dateModified, and it only zeroes the top-level `id` - not
   * workspaceId/groupId/step ids/connection step-id references nested inside the automation
   * graph. Run results through this afterward to strip all of those before snapshotting.
   */
  static normalizeIds(data: unknown): unknown {
    if (typeof data === "string") {
      // Some error/warning messages embed a raw UUID inline (e.g. "An automation with ID
      // 'xxxx' already exists.") - strip those too so such messages snapshot stably. Absolute
      // URLs (e.g. a webhook `url`) embed the instance's host, so swap that for a placeholder
      // to keep snapshots valid against any instance.
      const withoutIds = data.replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "00000000-0000-0000-0000-000000000000",
      );
      const baseUrl = process.env.UMBRACO_BASE_URL;
      return baseUrl
        ? withoutIds.replaceAll(normalizeBaseUrl(baseUrl), "<UMBRACO_BASE_URL>")
        : withoutIds;
    }
    if (Array.isArray(data)) {
      return data.map((item) => this.normalizeIds(item));
    }
    if (data && typeof data === "object") {
      const normalized: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      for (const idField of [
        "id",
        "workspaceId",
        "groupId",
        "stepId",
        "sourceStepId",
        "targetStepId",
        "automationId",
        "connectionId",
      ]) {
        if (normalized[idField]) {
          normalized[idField] = "00000000-0000-0000-0000-000000000000";
        }
      }
      if (normalized.dateCreated) {
        normalized.dateCreated = "NORMALIZED_DATE";
      }
      if (normalized.dateModified) {
        normalized.dateModified = "NORMALIZED_DATE";
      }
      if (normalized.exportedAt) {
        normalized.exportedAt = "NORMALIZED_DATE";
      }
      // exportedFrom.version is the installed Automate build (e.g. "17.4.0" or "18.4.0+6323387").
      if (normalized.product === "Umbraco.Automate" && normalized.version) {
        normalized.version = "NORMALIZED_VERSION";
      }
      for (const key of Object.keys(normalized)) {
        // Recurse into every remaining value (not just objects/arrays) so a plain string
        // field that happens to embed a UUID (e.g. a webhook `url`, or an error message) is
        // still run through the string-UUID replacement above.
        normalized[key] = this.normalizeIds(normalized[key]);
      }
      return normalized;
    }
    return data;
  }
}
