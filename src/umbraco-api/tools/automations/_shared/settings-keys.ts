/**
 * Settings Keys
 *
 * Automate stores a step's or trigger's `settings` verbatim and reads them into the step
 * type's settings class, so a key the step type doesn't declare is saved without complaint
 * and then has no effect: a Form Submitted trigger given `formId` instead of `formIds`
 * fires for every form, and resolving its output schema returns the generic envelope.
 * Nothing on the server reports this, not even publishing.
 *
 * So the step tools check the keys against the step type's settingsSchema from the
 * catalogue first and refuse unknown ones, suggesting the declared key a near miss was
 * meant to be. Keys match case-insensitively, as the server reads them. If the catalogue
 * can't be read, doesn't know the alias, or declares no settings fields for it, the check
 * is skipped and the API decides - a step type (e.g. from a package) may read settings it
 * doesn't declare, and refusing every key would make it impossible to configure.
 */

import {
  getApiClient,
  CAPTURE_RAW_HTTP_RESPONSE,
  ToolValidationError,
  type HttpResponse,
} from "@umbraco-cms/mcp-server-sdk";
import type {
  getUmbracoAutomateManagementAPI,
  StepTypeItemResponseModel,
} from "../../../api/generated/umbracoAutomateManagementApi.js";

type ApiClient = ReturnType<typeof getUmbracoAutomateManagementAPI>;

export interface UnknownSettingKey {
  key: string;
  /** The declared key this one most likely meant, if any. */
  suggestion?: string;
}

/** The keys in `settings` that `fields` (a settingsSchema's fields, or null for none) doesn't declare. */
export function findUnknownSettingKeys(
  fields: ReadonlyArray<{ key: string }> | null | undefined,
  settings: Record<string, unknown>
): UnknownSettingKey[] {
  const declared = (fields ?? []).map((field) => field.key);
  return Object.keys(settings)
    .filter((key) => !declared.some((d) => d.toLowerCase() === key.toLowerCase()))
    .map((key) => {
      const lower = key.toLowerCase();
      const suggestion = declared.find((d) => d.toLowerCase().startsWith(lower) || lower.startsWith(d.toLowerCase()));
      return suggestion ? { key, suggestion } : { key };
    });
}

/** The step type's declared settings fields, or undefined when there are none to check against. */
async function fetchSettingsFields(alias: string): Promise<ReadonlyArray<{ key: string }> | undefined> {
  try {
    const client = getApiClient<ApiClient>();
    const response = (await client.getCatalogueStepTypes({}, CAPTURE_RAW_HTTP_RESPONSE)) as unknown as HttpResponse<
      StepTypeItemResponseModel[]
    >;
    if (response.status < 200 || response.status >= 300 || !Array.isArray(response.data)) return undefined;
    const stepType = response.data.find((item) => item.alias === alias);
    const fields = stepType?.settingsSchema?.fields;
    return fields && fields.length > 0 ? fields : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Refuses `settings` keys the step type `alias` doesn't declare, listing the keys it does.
 * Does nothing if the catalogue can't be read, doesn't know the alias, or declares no settings for it.
 */
export async function assertKnownSettingKeys(alias: string, settings: Record<string, unknown> | undefined): Promise<void> {
  if (!settings || Object.keys(settings).length === 0) return;
  const fields = await fetchSettingsFields(alias);
  if (fields === undefined) return;

  const unknown = findUnknownSettingKeys(fields, settings);
  if (unknown.length === 0) return;

  const listed = unknown
    .map(({ key, suggestion }) => (suggestion ? `"${key}" (did you mean "${suggestion}"?)` : `"${key}"`))
    .join(", ");
  const declared = fields.map((field) => `"${field.key}"`).join(", ");
  throw new ToolValidationError({
    title: "Unknown settings",
    status: 400,
    detail:
      `"${alias}" has no setting ${listed}. Its settings are: ${declared}.` +
      " Automate would save an unknown key without using it, so the step would silently behave as if it were not set." +
      " Use the `key` values from the step type's settingsSchema in the catalogue.",
  });
}
