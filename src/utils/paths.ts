import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const appName = "pressship";

export function getConfigDir(): string {
  if (process.env.PRESSSHIP_CONFIG_DIR) {
    return path.resolve(process.env.PRESSSHIP_CONFIG_DIR);
  }

  if (process.env.PRESSPORT_CONFIG_DIR) {
    return path.resolve(process.env.PRESSPORT_CONFIG_DIR);
  }

  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, appName);
  }

  return path.join(homedir(), ".config", appName);
}

export async function ensureConfigDir(): Promise<string> {
  const configDir = getConfigDir();
  await mkdir(configDir, { recursive: true, mode: 0o700 });
  return configDir;
}

export function getStorageStatePath(): string {
  return path.join(getConfigDir(), "wordpress-org-storage.json");
}

export function getSvnCredentialsPath(): string {
  return path.join(getConfigDir(), "svn-credentials.json");
}

export function getWebLocalPluginsPath(): string {
  return path.join(getConfigDir(), "studio-local-plugins.json");
}

export function getWebSettingsPath(): string {
  return path.join(getConfigDir(), "studio-settings.json");
}

export function getWebPluginCheckStatePath(): string {
  return path.join(getConfigDir(), "studio-plugin-check-state.json");
}

export function getLegacyWebLocalPluginsPath(): string {
  return path.join(getConfigDir(), "web-local-plugins.json");
}

export function getLegacyWebSettingsPath(): string {
  return path.join(getConfigDir(), "web-settings.json");
}

export function getDebugDir(): string {
  return path.join(getConfigDir(), "debug");
}

export async function ensureDebugDir(): Promise<string> {
  const debugDir = getDebugDir();
  await mkdir(debugDir, { recursive: true, mode: 0o700 });
  return debugDir;
}

export function getCacheDir(): string {
  return path.join(getConfigDir(), "cache");
}

export async function ensureCacheDir(): Promise<string> {
  const cacheDir = getCacheDir();
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  return cacheDir;
}

export function getDefaultBuildDir(): string {
  return path.join(tmpdir(), appName);
}

export function pathExists(filePath: string): boolean {
  return existsSync(filePath);
}
