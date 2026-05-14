import { confirm, input } from "@inquirer/prompts";
import { execa } from "execa";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { listPackageFiles } from "../package/archive.js";
import { discoverPluginProject } from "../plugin/discover.js";
import type { CommandPlan } from "../types.js";
import { ui } from "../ui.js";
import { pathExists } from "../utils/paths.js";

const releaseOptionsSchema = z.object({
  slug: z.string().optional(),
  version: z.string().optional(),
  svnDir: z.string().optional(),
  username: z.string().optional(),
  message: z.string().optional(),
  dryRun: z.boolean().default(false),
  yes: z.boolean().default(false),
  ignore: z.array(z.string()).default([])
});

export type ReleaseOptions = z.input<typeof releaseOptionsSchema>;

export async function release(pluginPath: string | undefined, rawOptions: ReleaseOptions): Promise<void> {
  const options = releaseOptionsSchema.parse(rawOptions);
  ui.intro(options.dryRun ? "Dry-run SVN release" : "Release plugin to WordPress.org SVN");
  const rootDir = path.resolve(pluginPath ?? (await input({ message: "Plugin directory", default: process.cwd() })));
  const project = await ui.task("Discovering WordPress plugin", () => discoverPluginProject(rootDir), (value) =>
    `Discovered ${value.headers.pluginName}`
  );
  const slug = options.slug ?? project.slug;
  const version = options.version ?? project.version;

  if (!version) {
    throw new Error("Could not infer a plugin version. Pass --version or add Version to the plugin header.");
  }

  const svnDir = path.resolve(options.svnDir ?? path.join(process.cwd(), ".pressship-svn", slug));
  const message = options.message ?? `Release ${slug} ${version}`;
  const plan = createReleaseCommandPlan(slug, svnDir, version, message, options.username);

  ui.section("Release");
  ui.keyValue("SVN", ui.path(`https://plugins.svn.wordpress.org/${slug}`));
  ui.keyValue("Working copy", ui.path(svnDir));
  ui.keyValue("Version", ui.value(version));

  if (options.dryRun) {
    ui.section("Dry-run command plan");
    for (const command of plan) {
      console.log(`  ${ui.muted(formatCommand(command))}`);
    }
    return;
  }

  await ui.task("Preparing SVN working copy", () => ensureWorkingCopy(slug, svnDir, options.username));
  await ui.task("Syncing plugin files to trunk", () => syncTrunk(rootDir, path.join(svnDir, "trunk"), options.ignore));
  await ui.task("Adding changed files to SVN", () => runSvn(["add", "--force", "trunk"], svnDir));
  await ui.task("Removing deleted files from SVN", () => deleteMissingFiles(svnDir));
  await ui.task(`Creating tag ${version}`, () => createTag(version, svnDir));

  const status = await runSvn(["status"], svnDir, { capture: true });
  ui.section("SVN status");
  console.log(status || ui.muted("No SVN changes detected."));
  if (!status.trim()) {
    return;
  }

  if (!options.yes) {
    const shouldCommit = await confirm({ message: "Commit these SVN changes?", default: false });
    if (!shouldCommit) {
      throw new Error("SVN release cancelled before commit.");
    }
  }

  await ui.task("Committing SVN release", () => runSvn(["commit", "-m", message, ...usernameArgs(options.username)], svnDir));
}

export function createReleaseCommandPlan(
  slug: string,
  svnDir: string,
  version: string,
  message: string,
  username?: string
): CommandPlan[] {
  return [
    {
      command: "svn",
      args: ["checkout", `https://plugins.svn.wordpress.org/${slug}`, svnDir, ...usernameArgs(username)]
    },
    { command: "svn", args: ["add", "--force", "trunk"], cwd: svnDir },
    { command: "svn", args: ["copy", "trunk", `tags/${version}`], cwd: svnDir },
    { command: "svn", args: ["status"], cwd: svnDir },
    { command: "svn", args: ["commit", "-m", message, ...usernameArgs(username)], cwd: svnDir }
  ];
}

async function ensureWorkingCopy(slug: string, svnDir: string, username?: string): Promise<void> {
  await mkdir(path.dirname(svnDir), { recursive: true });

  try {
    await runSvn(["info"], svnDir, { capture: true });
    await runSvn(["update"], svnDir);
  } catch {
    await runSvn(
      ["checkout", `https://plugins.svn.wordpress.org/${slug}`, svnDir, ...usernameArgs(username)],
      process.cwd()
    );
  }
}

async function syncTrunk(pluginRoot: string, trunkDir: string, ignore: string[]): Promise<void> {
  await mkdir(trunkDir, { recursive: true });
  await emptyDirectory(trunkDir);

  const files = await listPackageFiles(pluginRoot, { ignore });
  for (const file of files) {
    const source = path.join(pluginRoot, file);
    const destination = path.join(trunkDir, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

async function emptyDirectory(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".svn") {
      continue;
    }
    await rm(path.join(directory, entry.name), { recursive: true, force: true });
  }
}

async function deleteMissingFiles(svnDir: string): Promise<void> {
  const status = await runSvn(["status"], svnDir, { capture: true });
  const missing = status
    .split(/\r?\n/)
    .filter((line) => line.startsWith("!"))
    .map((line) => line.slice(8).trim())
    .filter(Boolean);

  for (const file of missing) {
    await runSvn(["delete", file], svnDir);
  }
}

async function createTag(version: string, svnDir: string): Promise<void> {
  const tagPath = path.join(svnDir, "tags", version);
  if (pathExists(tagPath)) {
    throw new Error(`SVN tag tags/${version} already exists. Choose a new version; tags should not be overwritten.`);
  }
  await mkdir(path.dirname(tagPath), { recursive: true });
  await runSvn(["copy", "trunk", `tags/${version}`], svnDir);
}

async function runSvn(
  args: string[],
  cwd: string,
  options: { capture?: boolean } = {}
): Promise<string> {
  const result = await execa("svn", args, {
    cwd,
    reject: false,
    stdout: options.capture ? "pipe" : "inherit",
    stderr: options.capture ? "pipe" : "inherit"
  });

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `svn ${args.join(" ")} failed.`);
  }

  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

function usernameArgs(username?: string): string[] {
  return username ? ["--username", username] : [];
}

function formatCommand(command: CommandPlan): string {
  const prefix = command.cwd ? `(cd ${command.cwd} && ` : "";
  const suffix = command.cwd ? ")" : "";
  return `${prefix}${command.command} ${command.args.map(quoteArg).join(" ")}${suffix}`;
}

function quoteArg(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}
