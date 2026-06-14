import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import type { Finding } from "../types.js";
import { prepareManagedPluginCheckEnvironment, type WpCliCommand } from "./plugin-check-environment.js";

export type PluginCheckOptions = {
  mode?: "new" | "update";
  skip?: boolean;
  extraArgs?: string[];
  wpPath?: string;
};

export type PluginCheckResult = {
  skipped: boolean;
  available: boolean;
  findings: Finding[];
  rawOutput?: string;
};

export async function runPluginCheck(
  target: string,
  options: PluginCheckOptions = {}
): Promise<PluginCheckResult> {
  if (options.skip) {
    return { skipped: true, available: true, findings: [] };
  }

  const environment = await resolvePluginCheckEnvironment(options);
  if (!environment.available) {
    return {
      skipped: false,
      available: false,
      findings: [environment.finding]
    };
  }

  const args = [
    `--path=${environment.wpPath}`,
    ...(environment.requirePath ? [`--require=${environment.requirePath}`] : []),
    "plugin",
    "check",
    target,
    "--format=strict-json",
    "--fields=file,line,column,type,code,message,docs",
    `--mode=${options.mode ?? "new"}`,
    ...(options.extraArgs ?? [])
  ];

  const result = await execa(environment.wpCli.command, [...environment.wpCli.baseArgs, ...args], { reject: false });
  const rawOutput = `${result.stdout}\n${result.stderr}`.trim();
  const setupFinding = getPluginCheckSetupFinding(rawOutput);

  const parsedFindings = setupFinding ? [setupFinding] : parsePluginCheckOutput(rawOutput, result.exitCode);

  return {
    skipped: false,
    available: !setupFinding,
    rawOutput,
    findings: setupFinding ? parsedFindings : await normalizePluginCheckFindingPaths(parsedFindings, target)
  };
}

export function parsePluginCheckOutput(output: string, exitCode = 0): Finding[] {
  if (!output.trim()) {
    return exitCode === 0
      ? []
      : [
          {
            severity: "error",
            code: "plugin_check.failed",
            message: "Plugin Check failed without JSON output."
          }
        ];
  }

  const jsonText = extractJson(output);
  if (!jsonText) {
    const setupFinding = getPluginCheckSetupFinding(output);
    if (setupFinding) {
      return [setupFinding];
    }

    return [
      {
        severity: exitCode === 0 ? "warning" : "error",
        code: "plugin_check.unparsed_output",
        message: output
      }
    ];
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    return normalizePluginCheckFindings(parsed);
  } catch {
    return [
      {
        severity: exitCode === 0 ? "warning" : "error",
        code: "plugin_check.invalid_json",
        message: output
      }
    ];
  }
}

export function getPluginCheckSetupFinding(output: string): Finding | undefined {
  if (/No WordPress installation found/i.test(output)) {
    return {
      severity: "warning",
      code: "plugin_check.wordpress_path_missing",
      message:
        "WP-CLI could not find a WordPress installation. Re-run with `--wp-path /path/to/wordpress`, or use `--skip-plugin-check`."
    };
  }

  if (/'check' is not a registered subcommand of 'plugin'|not a registered subcommand/i.test(output)) {
    return {
      severity: "warning",
      code: "plugin_check.command_missing",
      message:
        "WP-CLI is available, but `wp plugin check` is not registered. Install and activate the WordPress.org Plugin Check plugin in your WordPress install, then pass `--wp-path /path/to/wordpress`, or use `--skip-plugin-check`."
    };
  }

  return undefined;
}

export async function normalizePluginCheckFindingPaths(findings: Finding[], target: string): Promise<Finding[]> {
  const targetRoots = await resolvePluginCheckTargetRoots(target);
  return Promise.all(
    findings.map(async (finding) => {
      const file = await normalizePluginCheckFindingFile(finding.file, targetRoots);
      return file === finding.file ? finding : { ...finding, file };
    })
  );
}

function extractJson(output: string): string | undefined {
  const trimmed = output.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return trimmed;
  }

  const arrayStart = trimmed.indexOf("[");
  const objectStart = trimmed.indexOf("{");
  const start = [arrayStart, objectStart].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return start === undefined ? undefined : trimmed.slice(start);
}

type ResolvedPluginCheckEnvironment =
  | {
      available: true;
      wpCli: WpCliCommand;
      wpPath: string;
      requirePath?: string;
    }
  | {
      available: false;
      finding: Finding;
    };

async function resolvePluginCheckEnvironment(options: PluginCheckOptions): Promise<ResolvedPluginCheckEnvironment> {
  if (options.wpPath) {
    const systemWp = await execa("wp", ["--version"], { reject: false });
    if (systemWp.exitCode !== 0) {
      return {
        available: false,
        finding: {
          severity: "warning",
          code: "plugin_check.wp_cli_missing",
          message:
            "WP-CLI was not found. Pressship can manage WP-CLI automatically when `--wp-path` is omitted, or install WP-CLI yourself for this custom path."
        }
      };
    }

    return {
      available: true,
      wpCli: { command: "wp", baseArgs: [] },
      wpPath: options.wpPath
    };
  }

  try {
    const managed = await prepareManagedPluginCheckEnvironment();
    return {
      available: true,
      wpCli: managed.wpCli,
      wpPath: managed.wpPath,
      requirePath: managed.requirePath
    };
  } catch (error) {
    return {
      available: false,
      finding: {
        severity: "warning",
        code: "plugin_check.managed_setup_failed",
        message: `Could not prepare managed Plugin Check environment automatically. ${
          error instanceof Error ? error.message : String(error)
        } Use \`--skip-plugin-check\` to bypass this step.`
      }
    };
  }
}

function normalizePluginCheckFindings(parsed: unknown): Finding[] {
  const records = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null && "results" in parsed && Array.isArray(parsed.results)
      ? parsed.results
      : [];

  return records.flatMap((record) => {
    if (typeof record !== "object" || record === null) {
      return [];
    }

    const item = record as Record<string, unknown>;
    const severity = normalizeSeverity(item.type ?? item.severity);
    const message = String(item.message ?? item.description ?? item.title ?? "Plugin Check finding");
    const code = item.code ? String(item.code) : item.check ? String(item.check) : undefined;
    const file = firstString(item.file, item.filename, item.path);
    const line = typeof item.line === "number" ? item.line : undefined;
    const column = typeof item.column === "number" ? item.column : undefined;

    return [{ severity, message, code, file, line, column }];
  });
}

async function resolvePluginCheckTargetRoots(target: string): Promise<string[]> {
  const resolved = path.resolve(target);
  const roots = [resolved];
  try {
    const real = await realpath(resolved);
    if (!roots.includes(real)) {
      roots.push(real);
    }
  } catch {
    // If realpath fails, the resolved path is still useful for relative repairs.
  }
  return roots;
}

async function normalizePluginCheckFindingFile(
  file: string | undefined,
  targetRoots: string[]
): Promise<string | undefined> {
  if (!file) {
    return undefined;
  }

  const normalized = file.replace(/\\/g, "/");
  if (path.isAbsolute(file)) {
    const absolutePath = path.resolve(file);
    for (const root of targetRoots) {
      if (absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`)) {
        return path.relative(root, absolutePath).split(path.sep).join("/");
      }
    }
  }

  for (const candidate of pluginCheckPrivatePrefixCandidates(normalized)) {
    if (await pluginCheckTargetFileExists(targetRoots, candidate)) {
      return candidate;
    }
  }

  return normalized;
}

function pluginCheckPrivatePrefixCandidates(file: string): string[] {
  if (!file.startsWith("/private") || file.startsWith("/private/")) {
    return [];
  }

  const candidate = file.slice("/private".length).replace(/^\/+/, "");
  return candidate ? [candidate] : [];
}

async function pluginCheckTargetFileExists(targetRoots: string[], relativePath: string): Promise<boolean> {
  if (!relativePath || relativePath.split("/").some((segment) => segment === "..")) {
    return false;
  }

  for (const root of targetRoots) {
    const filePath = path.resolve(root, relativePath);
    if (filePath === root || !filePath.startsWith(`${root}${path.sep}`)) {
      continue;
    }
    try {
      return (await stat(filePath)).isFile();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  return false;
}

function normalizeSeverity(value: unknown): Finding["severity"] {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("error")) {
    return "error";
  }
  if (text.includes("warn")) {
    return "warning";
  }
  return "info";
}

function firstString(...values: unknown[]): string | undefined {
  const value = values.find((item) => typeof item === "string" && item.length > 0);
  return typeof value === "string" ? value : undefined;
}
