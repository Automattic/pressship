import path from "node:path";
import { z } from "zod";
import { hasBlockingFindings, printFindings } from "../checks/summary.js";
import { discoverPluginProject } from "../plugin/discover.js";
import type { PluginProject } from "../types.js";
import { ui } from "../ui.js";
import { validatePluginPack, type PackValidationResult } from "./pack.js";

const verifyOptionsSchema = z.object({
  ignore: z.array(z.string()).default([]),
  skipReadmeValidator: z.boolean().default(false),
  wpPath: z.string().optional(),
  json: z.boolean().default(false)
});

export type VerifyOptions = z.input<typeof verifyOptionsSchema>;

export type VerifySummary = {
  ok: boolean;
  plugin: {
    rootDir: string;
    mainFile: string;
    name: string;
    slug: string;
    version?: string;
    readmePath?: string;
  };
  validation: PackValidationResult;
};

export async function verify(pluginPath: string | undefined, rawOptions: VerifyOptions): Promise<void> {
  const options = verifyOptionsSchema.parse(rawOptions);

  if (!options.json) {
    ui.intro("Verify WordPress plugin");
  }

  const rootDir = path.resolve(pluginPath ?? process.cwd());
  const project = options.json
    ? await discoverPluginProject(rootDir)
    : await ui.task("Discovering WordPress plugin", () => discoverPluginProject(rootDir), (value) =>
        `Discovered ${value.headers.pluginName}`
      );
  const validation = options.json
    ? await validatePluginPack(project, options)
    : await ui.task("Verifying plugin", () => validatePluginPack(project, options));
  const summary = summarizeVerifyResult(project, validation);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.ok) {
      process.exitCode = 1;
    }
    return;
  }

  printFindings("Readme validation", validation.readmeFindings);
  printFindings("Plugin Check", validation.pluginCheckFindings);

  if (!summary.ok) {
    throw new Error("Verification reported blocking findings.");
  }

  ui.success("Verification passed.");
}

export function summarizeVerifyResult(
  project: PluginProject,
  validation: PackValidationResult
): VerifySummary {
  return {
    ok: !hasBlockingFindings(validation.readmeFindings) && !hasBlockingFindings(validation.pluginCheckFindings),
    plugin: {
      rootDir: project.rootDir,
      mainFile: project.mainFile,
      name: project.headers.pluginName,
      slug: project.slug,
      version: project.version,
      readmePath: project.readmePath
    },
    validation
  };
}
