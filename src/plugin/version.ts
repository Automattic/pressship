import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { discoverPluginProject } from "./discover.js";
import { ui } from "../ui.js";

const bumpSchema = z.enum(["patch", "minor", "major"]);

export type VersionBump = z.infer<typeof bumpSchema>;

export async function version(bumpArg: string, pluginPathArg?: string): Promise<void> {
  const bump = bumpSchema.parse(bumpArg);
  const pluginPath = path.resolve(pluginPathArg ?? process.cwd());
  ui.intro(`Bump plugin version (${bump})`);

  const project = await ui.task("Discovering WordPress plugin", () => discoverPluginProject(pluginPath), (value) =>
    `Discovered ${value.headers.pluginName}`
  );

  if (!project.version) {
    throw new Error("Could not find a Version header in the main plugin file.");
  }

  const nextVersion = bumpVersion(project.version, bump);

  await ui.task("Updating main plugin header", () => updatePluginHeaderVersion(project.mainFile, nextVersion));

  if (project.readmePath) {
    await ui.task("Updating readme stable tag", () => updateReadmeStableTag(project.readmePath!, nextVersion));
  } else {
    ui.warn("No readme.txt found; only the main plugin header was updated.");
  }

  ui.success(`${project.version} → ${nextVersion}`);
  console.log(nextVersion);
}

export function bumpVersion(currentVersion: string, bump: VersionBump): string {
  const match = currentVersion.trim().match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) {
    throw new Error(`Unsupported version "${currentVersion}". Expected semver like 1.2.3.`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (bump === "major") {
    return `${major + 1}.0.0`;
  }

  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  return `${major}.${minor}.${patch + 1}`;
}

export async function updatePluginHeaderVersion(mainFile: string, nextVersion: string): Promise<void> {
  const contents = await readFile(mainFile, "utf8");
  const updated = contents.replace(
    /^([ \t/*#@]*Version\s*:\s*)(.+?)\s*$/im,
    `$1${nextVersion}`
  );

  if (updated === contents) {
    throw new Error(`Could not update Version header in ${mainFile}.`);
  }

  await writeFile(mainFile, updated);
}

export async function updateReadmeStableTag(readmePath: string, nextVersion: string): Promise<void> {
  const contents = await readFile(readmePath, "utf8");
  const updated = contents.replace(
    /^(Stable tag\s*:\s*)(.+?)\s*$/im,
    `$1${nextVersion}`
  );

  if (updated === contents) {
    throw new Error(`Could not update Stable tag in ${readmePath}.`);
  }

  await writeFile(readmePath, updated);
}

