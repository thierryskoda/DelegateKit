import type { ToolContract } from "./contract";

const PLUGIN_TOOL_CONTRACT_ID_SUFFIX = "-tools";

function pluginToolDomainSlugFromPluginId(pluginId: string): string {
  if (pluginId === "assistant-builtin") return "";
  if (!pluginId.endsWith(PLUGIN_TOOL_CONTRACT_ID_SUFFIX)) {
    throw new Error(
      `Tool contract pluginId must end with "${PLUGIN_TOOL_CONTRACT_ID_SUFFIX}": ${JSON.stringify(pluginId)}`,
    );
  }
  return pluginId.slice(0, -PLUGIN_TOOL_CONTRACT_ID_SUFFIX.length).replace(/-/g, "_");
}

function toolNameMatchesAllowedDomainPrefixes(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => name === prefix || name.startsWith(`${prefix}_`));
}

function allowedToolNamePrefixesForPluginId(pluginId: string): string[] {
  if (pluginId === "profile-context-tools") return ["profile"];
  if (pluginId === "scheduled-tasks-tools") return ["scheduled_task"];
  if (pluginId === "actions-tools") return ["action", "write_policy"];
  if (pluginId === "proposals-tools") return ["proposal"];
  if (pluginId === "profile-links-tools") return ["portal_link", "mini_app_link"];
  if (pluginId === "profile-files") return ["profile_file"];
  if (pluginId === "file-analysis-tools") return ["file"];
  return [pluginToolDomainSlugFromPluginId(pluginId)];
}

export function assertToolContractNamesMatchPluginDomain(contracts: readonly ToolContract[]): void {
  for (const contract of contracts) {
    if (contract.executionKind === "builtin") continue;
    const prefixes = allowedToolNamePrefixesForPluginId(contract.pluginId);
    if (!toolNameMatchesAllowedDomainPrefixes(contract.name, prefixes)) {
      const expected = prefixes.map((p) => `${p}_…`).join(" or ");
      throw new Error(
        `Tool contract ${JSON.stringify(contract.name)} (plugin ${JSON.stringify(contract.pluginId)}) must match domain prefix: ${expected}.`,
      );
    }
  }
}
