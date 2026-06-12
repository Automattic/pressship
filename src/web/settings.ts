import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { ensureConfigDir, getLegacyWebSettingsPath, getWebSettingsPath, pathExists } from "../utils/paths.js";
import { isAiAssistantId, type AiAssistantId } from "./ai-assistance.js";

const aiAssistantSchema = z.custom<AiAssistantId>(
  (value) => typeof value === "string" && isAiAssistantId(value),
  { message: "Unknown AI assistant." }
);

export const webSettingsSchema = z.object({
  defaultCheckoutDir: z.string().min(1),
  aiAssistant: aiAssistantSchema,
  defaultPublishAction: z.enum(["auto", "submit", "release"]),
  playgroundPortStart: z.number().int().min(1).max(65535),
  playgroundPortEnd: z.number().int().min(1).max(65535),
  playgroundDatabaseMode: z.enum(["auto", "sqlite", "mysql"]),
  playgroundMysqlHost: z.string().trim().min(1),
  playgroundMysqlPort: z.number().int().min(1).max(65535),
  playgroundMysqlUser: z.string().trim().min(1),
  playgroundMysqlPassword: z.string(),
  playgroundMysqlDatabasePrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]+$/, "MySQL database prefix can only contain letters, numbers, and underscores.")
    .min(1)
    .max(40),
  autoRefreshSeconds: z.number().int().min(0).max(3600),
  confirmDestructiveActions: z.boolean(),
  defaultBumpLevel: z.enum(["patch", "minor", "major"]),
  debugMode: z.boolean()
});

export type WebSettings = z.infer<typeof webSettingsSchema>;

export function getDefaultCheckoutDir(): string {
  return path.join(homedir(), ".pressship", "plugins");
}

export const defaultWebSettings: WebSettings = {
  defaultCheckoutDir: getDefaultCheckoutDir(),
  aiAssistant: "wp-studio",
  defaultPublishAction: "auto",
  playgroundPortStart: 9500,
  playgroundPortEnd: 9599,
  playgroundDatabaseMode: "auto",
  playgroundMysqlHost: "127.0.0.1",
  playgroundMysqlPort: 3306,
  playgroundMysqlUser: "root",
  playgroundMysqlPassword: "",
  playgroundMysqlDatabasePrefix: "pressship_playground",
  autoRefreshSeconds: 0,
  confirmDestructiveActions: true,
  defaultBumpLevel: "patch",
  debugMode: false
};

export async function readWebSettings(): Promise<WebSettings> {
  const filePath = pathExists(getWebSettingsPath()) ? getWebSettingsPath() : getLegacyWebSettingsPath();
  if (!pathExists(filePath)) {
    return { ...defaultWebSettings };
  }

  try {
    const parsed = webSettingsSchema.partial().parse(JSON.parse(await readFile(filePath, "utf8")));
    return { ...defaultWebSettings, ...parsed };
  } catch {
    return { ...defaultWebSettings };
  }
}

export async function writeWebSettings(settings: WebSettings): Promise<WebSettings> {
  const parsed = webSettingsSchema.parse(settings);
  if (parsed.playgroundPortEnd < parsed.playgroundPortStart) {
    throw new Error("Playground port range end must be greater than or equal to start.");
  }
  await ensureConfigDir();
  await writeFile(getWebSettingsPath(), `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  return parsed;
}
