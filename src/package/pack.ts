import path from "node:path";
import { z } from "zod";
import { createPluginZip, stagePluginDirectory } from "./archive.js";
import { runPluginCheck, type PluginCheckResult } from "../checks/plugin-check.js";
import { validateReadmeFile } from "../checks/readme-validator.js";
import { hasBlockingFindings, printFindings } from "../checks/summary.js";
import { discoverPluginProject } from "../plugin/discover.js";
import type { Finding, PackageResult, PluginProject } from "../types.js";
import { ui } from "../ui.js";
import { formatBytes } from "../utils/format.js";

const packOptionsSchema = z.object({
  outputDir: z.string().optional(),
  ignore: z.array(z.string()).default([]),
  json: z.boolean().default(false),
  validate: z.boolean().default(true),
  skipReadmeValidator: z.boolean().default(false),
  wpPath: z.string().optional()
});

export type PackOptions = z.input<typeof packOptionsSchema>;

export type PackValidationResult = {
  skipped: boolean;
  readmeFindings: Finding[];
  pluginCheckFindings: Finding[];
};

export type PackValidationDependencies = {
  validateReadmeFile?: typeof validateReadmeFile;
  stagePluginDirectory?: typeof stagePluginDirectory;
  runPluginCheck?: typeof runPluginCheck;
};

export type PackSummary = {
  zipPath: string;
  sizeBytes: number;
  size: string;
  topLevelFolder: string;
  fileCount: number;
  files: string[];
  validation: PackValidationResult;
};

export async function pack(pluginPath: string | undefined, rawOptions: PackOptions): Promise<void> {
  const options = packOptionsSchema.parse(rawOptions);

  if (!options.json) {
    ui.intro("Pack WordPress plugin");
  }

  const rootDir = path.resolve(pluginPath ?? process.cwd());
  const project = options.json
    ? await discoverPluginProject(rootDir)
    : await ui.task("Discovering WordPress plugin", () => discoverPluginProject(rootDir), (value) =>
        `Discovered ${value.headers.pluginName}`
      );
  const validation = await validateForPack(project, options);

  const result = options.json
    ? await createPluginZip(project, {
        outputDir: options.outputDir ?? process.cwd(),
        ignore: options.ignore
      })
    : await ui.task("Creating plugin zip", () => createPluginZip(project, {
        outputDir: options.outputDir ?? process.cwd(),
        ignore: options.ignore
      }), (value) =>
        `Created ${path.basename(value.zipPath)} (${formatBytes(value.sizeBytes)})`
      );
  const summary = summarizePackResult(result, validation);

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  ui.section("Package");
  ui.keyValue("Zip", ui.path(summary.zipPath));
  ui.keyValue("Size", summary.size);
  ui.keyValue("Folder", summary.topLevelFolder);
  ui.keyValue("Files", String(summary.fileCount));
}

export async function createPluginPack(
  pluginPath: string | undefined,
  options: Pick<PackOptions, "outputDir" | "ignore"> = {}
): Promise<PackageResult> {
  const rootDir = path.resolve(pluginPath ?? process.cwd());
  const project = await discoverPluginProject(rootDir);

  return createPluginZip(project, {
    outputDir: options.outputDir ?? process.cwd(),
    ignore: options.ignore
  });
}

export async function validatePluginPack(
  project: PluginProject,
  options: Pick<PackOptions, "ignore" | "skipReadmeValidator" | "wpPath"> = {},
  dependencies: PackValidationDependencies = {}
): Promise<PackValidationResult> {
  const readmeValidator = dependencies.validateReadmeFile ?? validateReadmeFile;
  const stagePlugin = dependencies.stagePluginDirectory ?? stagePluginDirectory;
  const pluginChecker = dependencies.runPluginCheck ?? runPluginCheck;
  const readmeFindings = project.readmePath
    ? (await readmeValidator(project.readmePath, {
        skipRemote: options.skipReadmeValidator,
        headless: true
      })).findings
    : [
        {
          severity: "error" as const,
          code: "readme.missing",
          message: "WordPress.org packages require a readme.txt file."
        }
      ];
  const checkTarget = await stagePlugin(project, {
    ignore: options.ignore
  });
  const pluginCheck = await pluginChecker(checkTarget.path, {
    mode: "new",
    wpPath: options.wpPath
  });

  return toPackValidationResult(readmeFindings, pluginCheck);
}

export function toPackValidationResult(
  readmeFindings: Finding[],
  pluginCheck: Pick<PluginCheckResult, "findings">
): PackValidationResult {
  return {
    skipped: false,
    readmeFindings,
    pluginCheckFindings: pluginCheck.findings
  };
}

export function skippedPackValidation(): PackValidationResult {
  return {
    skipped: true,
    readmeFindings: [],
    pluginCheckFindings: []
  };
}

export function summarizePackResult(
  result: PackageResult,
  validation: PackValidationResult = skippedPackValidation()
): PackSummary {
  return {
    zipPath: result.zipPath,
    sizeBytes: result.sizeBytes,
    size: formatBytes(result.sizeBytes),
    topLevelFolder: result.topLevelFolder,
    fileCount: result.files.length,
    files: result.files,
    validation
  };
}

async function validateForPack(
  project: PluginProject,
  options: z.infer<typeof packOptionsSchema>
): Promise<PackValidationResult> {
  if (!options.validate) {
    return skippedPackValidation();
  }

  const validation = options.json
    ? await validatePluginPack(project, options)
    : await ui.task("Validating package", () => validatePluginPack(project, options));

  if (!options.json) {
    printFindings("Readme validation", validation.readmeFindings);
    printFindings("Plugin Check", validation.pluginCheckFindings);
  }

  if (hasBlockingFindings(validation.readmeFindings) || hasBlockingFindings(validation.pluginCheckFindings)) {
    throw new Error("Package validation reported blocking findings. Re-run with `--no-validate` to create the zip anyway.");
  }

  return validation;
}
