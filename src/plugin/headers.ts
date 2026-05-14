import type { PluginHeaders } from "../types.js";

const headerMap = new Map<string, keyof PluginHeaders>([
  ["Plugin Name", "pluginName"],
  ["Plugin URI", "pluginUri"],
  ["Description", "description"],
  ["Version", "version"],
  ["Author", "author"],
  ["Author URI", "authorUri"],
  ["Text Domain", "textDomain"],
  ["Domain Path", "domainPath"],
  ["Requires at least", "requiresAtLeast"],
  ["Requires PHP", "requiresPhp"],
  ["Update URI", "updateUri"],
  ["License", "license"],
  ["License URI", "licenseUri"]
]);

export function parsePluginHeaders(contents: string): Partial<PluginHeaders> {
  const headerBlock = contents.slice(0, 8192);
  const headers: Partial<PluginHeaders> = {};

  for (const [label, key] of headerMap) {
    const pattern = new RegExp(`^[ \\t/*#@]*${escapeRegExp(label)}\\s*:\\s*(.+?)\\s*$`, "im");
    const match = headerBlock.match(pattern);
    if (match?.[1]) {
      headers[key] = normalizeHeaderValue(match[1]);
    }
  }

  return headers;
}

export function assertPluginHeaders(headers: Partial<PluginHeaders>): PluginHeaders {
  if (!headers.pluginName) {
    throw new Error("No WordPress plugin header found. Expected a PHP file with `Plugin Name:`.");
  }

  return {
    pluginName: headers.pluginName,
    pluginUri: headers.pluginUri,
    description: headers.description,
    version: headers.version,
    author: headers.author,
    authorUri: headers.authorUri,
    textDomain: headers.textDomain,
    domainPath: headers.domainPath,
    requiresAtLeast: headers.requiresAtLeast,
    requiresPhp: headers.requiresPhp,
    updateUri: headers.updateUri,
    license: headers.license,
    licenseUri: headers.licenseUri
  };
}

function normalizeHeaderValue(value: string): string {
  return value.replace(/\s+\*\/$/, "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
