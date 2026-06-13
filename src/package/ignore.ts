import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import { pathExists } from "../utils/paths.js";

export const pressshipIgnoreFile = ".pressshipignore";
export const legacyPressportIgnoreFile = ".pressportignore";
export const hardIgnoreDirectories = [".git", ".svn", "node_modules"];
export const hardIgnorePatterns = hardIgnoreDirectories.flatMap((directory) => [
  directory,
  `${directory}/**`,
  `**/${directory}`,
  `**/${directory}/**`
]);

export const defaultIgnorePatterns = [
  ".DS_Store",
  ...hardIgnorePatterns,
  ".gitignore",
  ".github",
  ".github/**",
  ".wordpress-org",
  ".wordpress-org/**",
  ".pressship-svn",
  ".pressship-svn/**",
  ".idea",
  ".idea/**",
  ".vscode",
  ".vscode/**",
  ".env",
  ".env.*",
  "node_modules",
  "node_modules/**",
  "dist",
  "dist/**",
  "build",
  "build/**",
  "coverage",
  "coverage/**",
  "tests",
  "tests/**",
  "*.log",
  "*.zip",
  legacyPressportIgnoreFile,
  pressshipIgnoreFile
];

export async function createIgnoreFilter(rootDir: string, extraPatterns: string[] = []) {
  const matcher = ignore().add(defaultIgnorePatterns).add(extraPatterns);
  const legacyIgnoreFile = path.join(rootDir, legacyPressportIgnoreFile);
  const ignoreFile = path.join(rootDir, pressshipIgnoreFile);

  if (pathExists(legacyIgnoreFile)) {
    matcher.add(await readFile(legacyIgnoreFile, "utf8"));
  }
  if (pathExists(ignoreFile)) {
    matcher.add(await readFile(ignoreFile, "utf8"));
  }

  return (relativePath: string): boolean => {
    const normalized = relativePath.split(path.sep).join("/");
    return !isHardIgnoredPath(normalized) && !matcher.ignores(normalized);
  };
}

export function isHardIgnoredPath(relativePath: string): boolean {
  const normalized = normalizeIgnorePath(relativePath);
  return normalized.split("/").some((segment) => hardIgnoreDirectories.includes(segment));
}

export type PressshipIgnoreMatcher = {
  ignores(relativePath: string): boolean;
  ignoredBy(relativePath: string): string | undefined;
};

export async function readPressshipIgnorePatterns(rootDir: string): Promise<string[]> {
  const ignorePath = path.join(rootDir, pressshipIgnoreFile);
  if (!pathExists(ignorePath)) {
    return [];
  }

  return parsePressshipIgnorePatterns(await readFile(ignorePath, "utf8"));
}

export function mergeIgnorePatterns(...groups: Array<string[] | undefined>): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    for (const pattern of group ?? []) {
      const normalized = normalizeExistingIgnorePattern(pattern);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      merged.push(normalized);
    }
  }

  return merged;
}

export async function addPressshipIgnorePattern(rootDir: string, input: string): Promise<string[]> {
  const pattern = normalizePressshipIgnorePattern(input);
  const ignorePath = path.join(rootDir, pressshipIgnoreFile);
  const existing = pathExists(ignorePath) ? await readFile(ignorePath, "utf8") : "";
  const lines = splitIgnoreLines(existing);
  const patterns = parsePressshipIgnorePatterns(existing);

  if (!patterns.includes(pattern)) {
    const nextLines = [...lines];
    while (nextLines.length && nextLines[nextLines.length - 1] === "") {
      nextLines.pop();
    }
    nextLines.push(pattern);
    await writePressshipIgnoreFile(ignorePath, nextLines.join("\n"));
  }

  return readPressshipIgnorePatterns(rootDir);
}

export async function removePressshipIgnorePattern(rootDir: string, input: string): Promise<string[]> {
  const pattern = normalizePressshipIgnorePattern(input, { allowNegation: true });
  const ignorePath = path.join(rootDir, pressshipIgnoreFile);
  if (!pathExists(ignorePath)) {
    return [];
  }

  const content = await readFile(ignorePath, "utf8");
  const nextLines = splitIgnoreLines(content).filter((line) => {
    const existing = normalizeExistingIgnorePattern(line);
    return existing === undefined || existing !== pattern;
  });
  while (nextLines.length && nextLines[nextLines.length - 1] === "") {
    nextLines.pop();
  }
  await writePressshipIgnoreFile(ignorePath, nextLines.join("\n"));
  return readPressshipIgnorePatterns(rootDir);
}

export function normalizePressshipIgnorePattern(
  input: string,
  options: { allowNegation?: boolean } = {}
): string {
  const trimmed = input.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  const rawPattern = trimmed.startsWith("!") && options.allowNegation
    ? `!${trimmed.slice(1).replace(/^\.\//, "")}`
    : trimmed;
  const pattern = normalizeDirectoryDotPattern(rawPattern);

  if (!pattern || pattern === "!") {
    throw new Error("Enter an ignore pattern first.");
  }
  if (pattern.startsWith("#")) {
    throw new Error("Ignore patterns cannot start with #.");
  }
  if (pattern.startsWith("!") && !options.allowNegation) {
    throw new Error("Negated patterns can be edited directly in .pressshipignore.");
  }
  if (pattern.includes("\0") || /[\r\n]/.test(pattern)) {
    throw new Error("Ignore patterns must be a single line.");
  }

  const pathPart = pattern.startsWith("!") ? pattern.slice(1) : pattern;
  if (pathPart.startsWith("/") || /^[A-Za-z]:/.test(pathPart)) {
    throw new Error("Ignore patterns must be relative to the plugin directory.");
  }
  if (pathPart.split("/").some((segment) => segment === "..")) {
    throw new Error("Ignore patterns cannot contain parent-directory segments.");
  }

  return pattern;
}

export function createPressshipIgnoreMatcher(patterns: string[]): PressshipIgnoreMatcher {
  const safePatterns = patterns.filter(Boolean);
  const matcher = ignore().add(safePatterns);
  const positivePatterns = safePatterns.filter((pattern) => !pattern.trim().startsWith("!"));

  return {
    ignores(relativePath: string): boolean {
      return matcher.ignores(normalizeIgnorePath(relativePath));
    },
    ignoredBy(relativePath: string): string | undefined {
      const normalized = normalizeIgnorePath(relativePath);
      if (!matcher.ignores(normalized)) {
        return undefined;
      }
      return positivePatterns.find((pattern) => ignore().add(pattern).ignores(normalized));
    }
  };
}

export function parsePressshipIgnorePatterns(content: string): string[] {
  return splitIgnoreLines(content)
    .map((line) => normalizeExistingIgnorePattern(line))
    .filter((pattern): pattern is string => Boolean(pattern));
}

function normalizeExistingIgnorePattern(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }
  return normalizeDirectoryDotPattern(trimmed.replace(/\\/g, "/").replace(/^\.\//, ""));
}

function normalizeIgnorePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/").replace(/^\.\//, "");
}

function normalizeDirectoryDotPattern(pattern: string): string {
  const negated = pattern.startsWith("!");
  const pathPart = negated ? pattern.slice(1) : pattern;
  if (!pathPart.endsWith("/.")) {
    return pattern;
  }
  const normalized = `${pathPart.slice(0, -2)}/**`;
  return negated ? `!${normalized}` : normalized;
}

function splitIgnoreLines(content: string): string[] {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!normalized) {
    return [];
  }
  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
}

async function writePressshipIgnoreFile(ignorePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(ignorePath), { recursive: true });
  await writeFile(ignorePath, content ? `${content}\n` : "", "utf8");
}
