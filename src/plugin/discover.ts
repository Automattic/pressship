import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { assertPluginHeaders, parsePluginHeaders } from "./headers.js";
import { parseReadme } from "./readme.js";
import type { PluginProject } from "../types.js";
import { pathExists } from "../utils/paths.js";
import { inferSlug } from "../utils/slug.js";

const ignoredDirectories = ["node_modules", "vendor", ".git", "dist", "build", "tests"];

export type PluginProjectPath = {
  inputDir: string;
  rootDir: string;
  svnRootDir?: string;
};

export async function discoverPluginProject(inputPath: string): Promise<PluginProject> {
  const { rootDir } = resolvePluginProjectPath(inputPath);
  const mainFile = await findMainPluginFile(rootDir);
  const mainContents = await readFile(mainFile, "utf8");
  const headers = assertPluginHeaders(parsePluginHeaders(mainContents));
  const readmePath = await findReadme(rootDir);
  const readme = readmePath ? parseReadme(await readFile(readmePath, "utf8")) : undefined;
  const slug = inferSlug(headers.pluginName, headers.textDomain);

  return {
    rootDir,
    mainFile,
    headers,
    readmePath,
    readme,
    slug,
    version: headers.version
  };
}

export function resolvePluginProjectPath(inputPath: string): PluginProjectPath {
  const inputDir = path.resolve(inputPath);

  if (isWordPressOrgSvnRoot(inputDir)) {
    return {
      inputDir,
      rootDir: path.join(inputDir, "trunk"),
      svnRootDir: inputDir
    };
  }

  if (isWordPressOrgSvnTrunk(inputDir)) {
    return {
      inputDir,
      rootDir: inputDir,
      svnRootDir: path.dirname(inputDir)
    };
  }

  return { inputDir, rootDir: inputDir };
}

export function isWordPressOrgSvnRoot(inputPath: string): boolean {
  return pathExists(path.join(inputPath, ".svn")) && pathExists(path.join(inputPath, "trunk"));
}

export function isWordPressOrgSvnTrunk(inputPath: string): boolean {
  const parentDir = path.dirname(inputPath);
  return path.basename(inputPath) === "trunk" && pathExists(path.join(parentDir, ".svn"));
}

async function findMainPluginFile(rootDir: string): Promise<string> {
  const phpFiles = await fg("**/*.php", {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
    ignore: ignoredDirectories.map((directory) => `${directory}/**`)
  });

  const candidates: Array<{ file: string; score: number }> = [];

  for (const file of phpFiles) {
    const contents = await readFile(file, "utf8");
    const headers = parsePluginHeaders(contents);
    if (headers.pluginName) {
      candidates.push({ file, score: scoreMainFile(rootDir, file) });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  if (!candidates[0]) {
    throw new Error(`No plugin main file found in ${rootDir}.`);
  }

  return candidates[0].file;
}

async function findReadme(rootDir: string): Promise<string | undefined> {
  const matches = await fg(["readme.txt", "README.txt"], {
    cwd: rootDir,
    absolute: true,
    onlyFiles: true,
    caseSensitiveMatch: false
  });

  return matches[0];
}

function scoreMainFile(rootDir: string, file: string): number {
  const relative = path.relative(rootDir, file);
  let score = 0;

  if (!relative.includes(path.sep)) {
    score += 10;
  }

  if (path.basename(file, ".php") === path.basename(rootDir)) {
    score += 5;
  }

  return score;
}
