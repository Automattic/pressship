import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { discoverPluginProject } from "../plugin/discover.js";
import { localPluginInfo, type LocalPluginInfo } from "../plugin/info.js";
import { ensureConfigDir, getLegacyWebLocalPluginsPath, getWebLocalPluginsPath, pathExists } from "../utils/paths.js";

const localPluginSourceSchema = z.enum(["manual", "clone"]);
const localPluginEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  source: localPluginSourceSchema,
  slug: z.string().min(1),
  name: z.string().min(1),
  addedAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
const localPluginRegistrySchema = z.object({
  version: z.literal(1),
  plugins: z.array(localPluginEntrySchema)
});

export type LocalPluginSource = z.infer<typeof localPluginSourceSchema>;
export type LocalPluginEntry = z.infer<typeof localPluginEntrySchema>;
export type LocalPluginRegistry = z.infer<typeof localPluginRegistrySchema>;
export type EnrichedLocalPlugin = LocalPluginEntry & {
  exists: boolean;
  info?: LocalPluginInfo;
  error?: string;
};

export async function readLocalPluginRegistry(): Promise<LocalPluginRegistry> {
  const registryPath = pathExists(getWebLocalPluginsPath()) ? getWebLocalPluginsPath() : getLegacyWebLocalPluginsPath();
  if (!pathExists(registryPath)) {
    return emptyRegistry();
  }

  try {
    return localPluginRegistrySchema.parse(JSON.parse(await readFile(registryPath, "utf8")));
  } catch {
    return emptyRegistry();
  }
}

export async function writeLocalPluginRegistry(registry: LocalPluginRegistry): Promise<void> {
  await ensureConfigDir();
  await writeFile(getWebLocalPluginsPath(), `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
}

export async function listLocalPlugins(): Promise<EnrichedLocalPlugin[]> {
  const registry = await readLocalPluginRegistry();

  return Promise.all(registry.plugins.map(enrichLocalPlugin));
}

export async function getLocalPlugin(id: string): Promise<EnrichedLocalPlugin | undefined> {
  const registry = await readLocalPluginRegistry();
  const entry = registry.plugins.find((plugin) => plugin.id === id);
  return entry ? enrichLocalPlugin(entry) : undefined;
}

export async function addLocalPluginPath(
  pluginPath: string,
  source: LocalPluginSource = "manual"
): Promise<EnrichedLocalPlugin> {
  const rootPath = path.resolve(pluginPath);
  const project = await discoverPluginProject(rootPath);
  const now = new Date().toISOString();
  const registry = await readLocalPluginRegistry();
  const id = pluginPathId(project.rootDir);
  const existing = registry.plugins.find((plugin) => plugin.id === id);
  const entry: LocalPluginEntry = {
    id,
    path: project.rootDir,
    source,
    slug: project.slug,
    name: project.headers.pluginName,
    addedAt: existing?.addedAt ?? now,
    updatedAt: now
  };

  await writeLocalPluginRegistry({
    version: 1,
    plugins: [...registry.plugins.filter((plugin) => plugin.id !== id), entry].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  });

  return enrichLocalPlugin(entry);
}

export async function removeLocalPlugin(id: string): Promise<boolean> {
  const registry = await readLocalPluginRegistry();
  const plugins = registry.plugins.filter((plugin) => plugin.id !== id);
  if (plugins.length === registry.plugins.length) {
    return false;
  }

  await writeLocalPluginRegistry({ version: 1, plugins });
  return true;
}

export function pluginPathId(pluginPath: string): string {
  return createHash("sha256").update(path.resolve(pluginPath)).digest("hex").slice(0, 24);
}

function emptyRegistry(): LocalPluginRegistry {
  return { version: 1, plugins: [] };
}

async function enrichLocalPlugin(entry: LocalPluginEntry): Promise<EnrichedLocalPlugin> {
  if (!pathExists(entry.path)) {
    return { ...entry, exists: false, error: "Plugin path no longer exists." };
  }

  try {
    const project = await discoverPluginProject(entry.path);
    return {
      ...entry,
      exists: true,
      slug: project.slug,
      name: project.headers.pluginName,
      info: localPluginInfo(project)
    };
  } catch (error) {
    return {
      ...entry,
      exists: true,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
