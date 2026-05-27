import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { ensureConfigDir, getWebPluginCheckStatePath, pathExists } from "../utils/paths.js";
import {
  summarizeStudioPluginCheckFindings,
  type StudioPluginCheckFinding,
  type StudioPluginCheckSummary
} from "./plugin-check.js";

const severitySchema = z.enum(["error", "warning", "info"]);
const studioPluginCheckFindingSchema = z.object({
  severity: severitySchema,
  message: z.string(),
  code: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  originalFile: z.string().optional()
});
const studioPluginCheckSummarySchema = z.object({
  error: z.number().int().min(0),
  warning: z.number().int().min(0),
  info: z.number().int().min(0),
  total: z.number().int().min(0),
  blocking: z.boolean()
});
const studioPluginCheckStateSchema = z.object({
  pluginId: z.string().min(1),
  pluginPath: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  checkedAt: z.string().min(1),
  skipped: z.boolean(),
  available: z.boolean(),
  findings: z.array(studioPluginCheckFindingSchema),
  summary: studioPluginCheckSummarySchema
});
const studioPluginCheckStateStoreSchema = z.object({
  version: z.literal(1),
  states: z.record(z.string(), studioPluginCheckStateSchema)
});

export type StudioPluginCheckState = z.infer<typeof studioPluginCheckStateSchema>;
type StudioPluginCheckStateStore = z.infer<typeof studioPluginCheckStateStoreSchema>;

export async function readStudioPluginCheckState(pluginId: string): Promise<StudioPluginCheckState | undefined> {
  return (await readStudioPluginCheckStateStore()).states[pluginId];
}

export async function writeStudioPluginCheckState(input: {
  pluginId: string;
  pluginPath: string;
  slug: string;
  name: string;
  skipped: boolean;
  available: boolean;
  findings: StudioPluginCheckFinding[];
  summary: StudioPluginCheckSummary;
  checkedAt?: string;
}): Promise<StudioPluginCheckState> {
  const store = await readStudioPluginCheckStateStore();
  const state = studioPluginCheckStateSchema.parse({
    ...input,
    checkedAt: input.checkedAt ?? new Date().toISOString()
  });

  store.states[input.pluginId] = state;
  await writeStudioPluginCheckStateStore(store);
  return state;
}

export async function removeStudioPluginCheckFindingsForFiles(
  pluginId: string,
  files: string[]
): Promise<StudioPluginCheckState | undefined> {
  const targetFiles = new Set(
    files.map(normalizeStateFilePath).filter((filePath): filePath is string => Boolean(filePath))
  );
  if (!targetFiles.size) {
    return readStudioPluginCheckState(pluginId);
  }

  const store = await readStudioPluginCheckStateStore();
  const current = store.states[pluginId];
  if (!current) {
    return undefined;
  }

  const findings = current.findings.filter((finding) => {
    const filePath = normalizeStateFilePath(finding.file);
    return !filePath || !targetFiles.has(filePath);
  });
  if (findings.length === current.findings.length) {
    return current;
  }

  const next = studioPluginCheckStateSchema.parse({
    ...current,
    checkedAt: new Date().toISOString(),
    findings,
    summary: summarizeStudioPluginCheckFindings(findings)
  });
  store.states[pluginId] = next;
  await writeStudioPluginCheckStateStore(store);
  return next;
}

export async function removeStudioPluginCheckState(pluginId: string): Promise<void> {
  const store = await readStudioPluginCheckStateStore();
  if (!(pluginId in store.states)) {
    return;
  }

  delete store.states[pluginId];
  await writeStudioPluginCheckStateStore(store);
}

async function readStudioPluginCheckStateStore(): Promise<StudioPluginCheckStateStore> {
  const statePath = getWebPluginCheckStatePath();
  if (!pathExists(statePath)) {
    return emptyStore();
  }

  try {
    return studioPluginCheckStateStoreSchema.parse(JSON.parse(await readFile(statePath, "utf8")));
  } catch {
    return emptyStore();
  }
}

async function writeStudioPluginCheckStateStore(store: StudioPluginCheckStateStore): Promise<void> {
  await ensureConfigDir();
  await writeFile(getWebPluginCheckStatePath(), `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

function emptyStore(): StudioPluginCheckStateStore {
  return { version: 1, states: {} };
}

function normalizeStateFilePath(filePath: string | undefined): string | undefined {
  return filePath?.replace(/\\/g, "/").replace(/^\/+/, "");
}
