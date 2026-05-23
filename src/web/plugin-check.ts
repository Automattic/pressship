import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, Severity } from "../types.js";

export type StudioPluginCheckFinding = Finding & {
  originalFile?: string;
};

export type StudioPluginCheckSummary = Record<Severity, number> & {
  total: number;
  blocking: boolean;
};

export function normalizeStudioPluginCheckFindings(
  findings: Finding[],
  pluginRoot: string,
  slug?: string
): StudioPluginCheckFinding[] {
  return findings.map((finding) => {
    const file = normalizeStudioPluginCheckPath(finding.file, pluginRoot, slug);
    return file === finding.file
      ? { ...finding }
      : {
          ...finding,
          file,
          originalFile: finding.file
        };
  });
}

export async function addStudioPluginCheckLineHints(
  findings: StudioPluginCheckFinding[],
  pluginRoot: string
): Promise<StudioPluginCheckFinding[]> {
  return Promise.all(
    findings.map(async (finding) => {
      if (isPositiveInteger(finding.line) || !finding.file) {
        return normalizeStudioFindingColumn(finding);
      }

      const line = await inferStudioFindingLine(finding, pluginRoot);
      return normalizeStudioFindingColumn({
        ...finding,
        line: line ?? 1
      });
    })
  );
}

export function summarizeStudioPluginCheckFindings(findings: Finding[]): StudioPluginCheckSummary {
  const summary: StudioPluginCheckSummary = {
    error: 0,
    warning: 0,
    info: 0,
    total: findings.length,
    blocking: false
  };

  for (const finding of findings) {
    summary[finding.severity] += 1;
  }
  summary.blocking = summary.error > 0;

  return summary;
}

function normalizeStudioPluginCheckPath(file: string | undefined, pluginRoot: string, slug?: string): string | undefined {
  if (!file) {
    return undefined;
  }

  const root = path.resolve(pluginRoot);
  const normalizedFile = file.replace(/\\/g, "/");
  const absolutePath = path.isAbsolute(file) ? path.resolve(file) : undefined;

  if (absolutePath && (absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`))) {
    return path.relative(root, absolutePath).split(path.sep).join("/");
  }

  const relative = normalizedFile.replace(/^\/+/, "");
  const leadingFolder = slug ?? path.basename(root);
  if (relative === leadingFolder) {
    return "";
  }
  if (relative.startsWith(`${leadingFolder}/`)) {
    return relative.slice(leadingFolder.length + 1);
  }

  return relative;
}

async function inferStudioFindingLine(
  finding: StudioPluginCheckFinding,
  pluginRoot: string
): Promise<number | undefined> {
  if (!finding.file) {
    return undefined;
  }

  if (path.basename(finding.file).toLowerCase() !== "readme.txt") {
    return 1;
  }

  const readmePath = resolveStudioFindingFilePath(pluginRoot, finding.file);
  if (!readmePath) {
    return 1;
  }

  try {
    return inferReadmeFindingLine(finding, await readFile(readmePath, "utf8")) ?? 1;
  } catch {
    return 1;
  }
}

function inferReadmeFindingLine(finding: StudioPluginCheckFinding, contents: string): number | undefined {
  const haystack = `${finding.code ?? ""} ${finding.message}`.toLowerCase();
  const fieldPatterns: Array<[RegExp, RegExp]> = [
    [/tested[_\s-]*(up[\s-]*to|upto)|tested up to/, /^\s*tested up to\s*:/i],
    [/stable[_\s-]*tag|stable tag/, /^\s*stable tag\s*:/i],
    [/requires[_\s-]*at[_\s-]*least|requires at least/, /^\s*requires at least\s*:/i],
    [/requires[_\s-]*php|requires php/, /^\s*requires php\s*:/i],
    [/license/, /^\s*license\s*:/i],
    [/contributors?/, /^\s*contributors\s*:/i],
    [/tags?/, /^\s*tags\s*:/i],
    [/donate/, /^\s*donate link\s*:/i]
  ];

  for (const [hint, linePattern] of fieldPatterns) {
    if (hint.test(haystack)) {
      const line = findReadmeLine(contents, linePattern);
      if (line) {
        return line;
      }
    }
  }

  return findReadmeLine(contents, /^===\s+.+?\s+===$/) ?? 1;
}

function findReadmeLine(contents: string, pattern: RegExp): number | undefined {
  const lines = contents.split(/\r?\n/);
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : undefined;
}

function resolveStudioFindingFilePath(pluginRoot: string, file: string): string | undefined {
  const root = path.resolve(pluginRoot);
  const normalized = file.replace(/\\/g, "/").replace(/^\/+/, "");
  const filePath = path.resolve(root, normalized);
  return filePath === root || filePath.startsWith(`${root}${path.sep}`) ? filePath : undefined;
}

function normalizeStudioFindingColumn(finding: StudioPluginCheckFinding): StudioPluginCheckFinding {
  if (!isPositiveInteger(finding.line)) {
    return finding;
  }

  return {
    ...finding,
    column: isPositiveInteger(finding.column) ? finding.column : 1
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
