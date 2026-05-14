import { readFile } from "node:fs/promises";
import path from "node:path";
import ignore from "ignore";
import { pathExists } from "../utils/paths.js";

export const defaultIgnorePatterns = [
  ".DS_Store",
  ".git",
  ".git/**",
  ".gitignore",
  ".github",
  ".github/**",
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
  ".pressportignore",
  ".pressshipignore"
];

export async function createIgnoreFilter(rootDir: string, extraPatterns: string[] = []) {
  const matcher = ignore().add(defaultIgnorePatterns).add(extraPatterns);
  const legacyIgnoreFile = path.join(rootDir, ".pressportignore");
  const ignoreFile = path.join(rootDir, ".pressshipignore");

  if (pathExists(legacyIgnoreFile)) {
    matcher.add(await readFile(legacyIgnoreFile, "utf8"));
  }
  if (pathExists(ignoreFile)) {
    matcher.add(await readFile(ignoreFile, "utf8"));
  }

  return (relativePath: string): boolean => {
    const normalized = relativePath.split(path.sep).join("/");
    return !matcher.ignores(normalized);
  };
}
