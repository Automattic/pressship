import { confirm, input } from "@inquirer/prompts";
import { execa } from "execa";
import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { listPackageFiles } from "../package/archive.js";
import { validatePluginPack } from "../package/pack.js";
import { discoverPluginProject, resolvePluginProjectPath } from "../plugin/discover.js";
import type { CommandPlan } from "../types.js";
import { ui } from "../ui.js";
import { pathExists } from "../utils/paths.js";
import { hasBlockingFindings, printFindings } from "../checks/summary.js";
import { resolveSvnCredentials, resolveSvnUsername, type SvnCredentials } from "./credentials.js";
import { ensureSvnAvailable, isSvnAvailable } from "./subversion.js";

const releaseOptionsSchema = z.object({
  slug: z.string().optional(),
  version: z.string().optional(),
  svnDir: z.string().optional(),
  username: z.string().optional(),
  message: z.string().optional(),
  dryRun: z.boolean().default(false),
  verify: z.boolean().default(true),
  skipReadmeValidator: z.boolean().default(false),
  wpPath: z.string().optional(),
  yes: z.boolean().default(false),
  ignore: z.array(z.string()).default([]),
  installSvn: z.boolean().default(true)
});

export type ReleaseOptions = z.input<typeof releaseOptionsSchema>;

export async function release(pluginPath: string | undefined, rawOptions: ReleaseOptions): Promise<void> {
  const options = releaseOptionsSchema.parse(rawOptions);
  ui.intro(options.dryRun ? "Dry-run SVN release" : "Release plugin to WordPress.org SVN");
  const inputDir = path.resolve(pluginPath ?? (await input({ message: "Plugin directory", default: process.cwd() })));
  const source = resolvePluginProjectPath(inputDir);
  const rootDir = source.rootDir;
  const project = await ui.task("Discovering WordPress plugin", () => discoverPluginProject(rootDir), (value) =>
    `Discovered ${value.headers.pluginName}`
  );
  const slug = options.slug ?? project.slug;
  const version = options.version ?? project.version;

  if (!version) {
    throw new Error("Could not infer a plugin version. Pass --version or add Version to the plugin header.");
  }

  const svnDir = path.resolve(options.svnDir ?? source.svnRootDir ?? path.join(process.cwd(), ".pressship-svn", slug));
  const message = options.message ?? `Release ${slug} ${version}`;
  const username = options.username ?? (options.dryRun ? undefined : await resolveSvnUsername());
  const plan = createReleaseCommandPlan(slug, svnDir, version, message, username);

  ui.section("Release");
  ui.keyValue("SVN", ui.path(`https://plugins.svn.wordpress.org/${slug}`));
  ui.keyValue("Working copy", ui.path(svnDir));
  ui.keyValue("Version", ui.value(version));
  if (username) {
    ui.keyValue("SVN user", ui.value(username));
  }

  if (options.dryRun) {
    ui.section("Dry-run command plan");
    for (const command of plan) {
      console.log(`  ${ui.muted(formatCommand(command))}`);
    }
    return;
  }

  await verifyRelease(project, options);
  await ensureSvnAvailable({ autoInstall: options.installSvn, interactive: process.stdin.isTTY });
  await ui.task("Preparing SVN working copy", () => ensureWorkingCopy(slug, svnDir));
  await assertReleaseVersionIsNew(version, svnDir);
  const packageFiles = await listPackageFiles(rootDir, { ignore: options.ignore });
  const trunkDir = path.join(svnDir, "trunk");
  if (samePath(rootDir, trunkDir)) {
    ui.info("Using the current SVN trunk working copy.");
    await ui.task("Removing ignored files from SVN tracking", () =>
      removeExcludedVersionedTrunkFiles(svnDir, packageFiles)
    );
  } else {
    await ui.task("Syncing plugin files to trunk", () => syncTrunk(rootDir, trunkDir, packageFiles));
  }
  const assetFiles = await syncAssets(rootDir, path.join(svnDir, "assets"));
  const includedSvnFiles = new Set([
    ...packageFiles.map((file) => path.posix.join("trunk", toSvnPath(file))),
    ...assetFiles
  ]);
  await ui.task("Adding changed files to SVN", () => addSvnFiles(svnDir, Array.from(includedSvnFiles)));
  await ui.task("Removing deleted files from SVN", () => deleteMissingFiles(svnDir));
  await ui.task(`Creating tag ${version}`, () => createTag(version, svnDir));
  await setAssetMimeTypes(svnDir);
  await ui.task("Updating SVN working copy", () => runSvn(["update"], svnDir));

  const status = filterIgnoredUntrackedSvnStatus(
    await runSvn(["status"], svnDir, { capture: true }),
    includedSvnFiles
  );
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

  const credentials = await resolveSvnCredentials(username);
  await ui.task("Committing SVN release", () =>
    runSvn(["commit", "-m", message, ...svnCredentialArgs(credentials)], svnDir)
  );
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
      args: ["checkout", `https://plugins.svn.wordpress.org/${slug}`, svnDir]
    },
    {
      command: "svn",
      args: ["add", "--force", "trunk/<package-included-files>", "assets/<wordpress-org-assets>"],
      cwd: svnDir
    },
    { command: "svn", args: ["copy", "trunk", `tags/${version}`], cwd: svnDir },
    { command: "svn", args: ["update"], cwd: svnDir },
    { command: "svn", args: ["status"], cwd: svnDir },
    { command: "svn", args: ["commit", "-m", message, ...svnCredentialPreviewArgs(username)], cwd: svnDir }
  ];
}

export async function svnRepositoryExists(slug: string): Promise<boolean> {
  if (!(await isSvnAvailable())) {
    throw new Error("`svn` is not installed. Pressship can install it when you run a release or get command.");
  }

  const result = await execa("svn", ["info", `https://plugins.svn.wordpress.org/${slug}`], {
    reject: false,
    stdout: "pipe",
    stderr: "pipe"
  });

  return result.exitCode === 0;
}

export async function assertReleaseVersionIsNew(version: string, svnDir: string): Promise<void> {
  if (!pathExists(path.join(svnDir, "tags", version))) {
    return;
  }

  throw new Error(
    `No version change detected. Version ${version} already exists in WordPress.org SVN, so it cannot be published again. Bump the plugin version with \`pressship version patch\` or pass --version before publishing.`
  );
}

async function verifyRelease(
  project: Awaited<ReturnType<typeof discoverPluginProject>>,
  options: z.infer<typeof releaseOptionsSchema>
): Promise<void> {
  if (!options.verify) {
    ui.warn("Skipping readme validation and Plugin Check because --no-verify was passed.");
    return;
  }

  const validation = await ui.task("Verifying plugin before SVN release", () =>
    validatePluginPack(project, {
      ignore: options.ignore,
      skipReadmeValidator: options.skipReadmeValidator,
      wpPath: options.wpPath
    })
  );

  printFindings("Readme validation", validation.readmeFindings);
  printFindings("Plugin Check", validation.pluginCheckFindings);

  if (hasBlockingFindings(validation.readmeFindings) || hasBlockingFindings(validation.pluginCheckFindings)) {
    throw new Error("Release verification reported blocking findings. Re-run with `--no-verify` to publish anyway.");
  }
}

async function ensureWorkingCopy(slug: string, svnDir: string): Promise<void> {
  await mkdir(path.dirname(svnDir), { recursive: true });

  try {
    await runSvn(["info"], svnDir, { capture: true });
    await runSvn(["update"], svnDir);
  } catch {
    await runSvn(["checkout", `https://plugins.svn.wordpress.org/${slug}`, svnDir], process.cwd());
  }
}

async function syncTrunk(pluginRoot: string, trunkDir: string, files: string[]): Promise<void> {
  await mkdir(trunkDir, { recursive: true });
  await emptyDirectory(trunkDir);

  for (const file of files) {
    const source = path.join(pluginRoot, file);
    const destination = path.join(trunkDir, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

async function syncAssets(pluginRoot: string, assetsDir: string): Promise<string[]> {
  const sourceAssetsDir = path.join(pluginRoot, ".wordpress-org");
  if (!pathExists(sourceAssetsDir)) {
    return [];
  }

  await ui.task("Syncing WordPress.org assets", async () => {
    await mkdir(assetsDir, { recursive: true });
    await emptyDirectory(assetsDir);
    await cp(sourceAssetsDir, assetsDir, { recursive: true });
  });

  return listDirectoryFiles(assetsDir, "assets");
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

async function removeExcludedVersionedTrunkFiles(svnDir: string, includedFiles: string[]): Promise<void> {
  const included = new Set(includedFiles.map(toSvnPath));
  const versioned = await listVersionedTrunkFiles(svnDir);
  const excluded = versioned.filter((file) => !included.has(file));

  for (const file of excluded) {
    await runSvn(["delete", "--keep-local", path.posix.join("trunk", file)], svnDir);
  }
}

async function listVersionedTrunkFiles(svnDir: string): Promise<string[]> {
  const output = await runSvn(["list", "-R", "trunk"], svnDir, { capture: true });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith("/"))
    .map(toSvnPath);
}

async function addSvnFiles(svnDir: string, relativeFiles: string[]): Promise<void> {
  const files = Array.from(new Set(relativeFiles.map(toSvnPath))).sort((a, b) => a.localeCompare(b));
  const directories = Array.from(collectParentDirectories(files)).sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)
  );

  for (const directory of directories) {
    await runSvnAdd(["add", "--force", "--depth", "empty", directory], svnDir);
  }
  for (const file of files) {
    await runSvnAdd(["add", "--force", file], svnDir);
  }
}

function collectParentDirectories(files: string[]): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    let directory = path.posix.dirname(file);
    while (directory && directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return directories;
}

async function listDirectoryFiles(directory: string, baseRelative: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(baseRelative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listDirectoryFiles(absolute, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function filterIgnoredUntrackedSvnStatus(status: string, includedSvnFiles: Set<string>): string {
  return status
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.trim()) {
        return false;
      }
      if (!line.startsWith("?")) {
        return true;
      }
      const relativePath = toSvnPath(line.slice(8).trim());
      return !relativePath.startsWith("trunk/") || includedSvnFiles.has(relativePath);
    })
    .join("\n");
}

async function createTag(version: string, svnDir: string): Promise<void> {
  const tagPath = path.join(svnDir, "tags", version);
  if (pathExists(tagPath)) {
    throw new Error(
      `No version change detected. Version ${version} already exists in WordPress.org SVN, so it cannot be published again. Bump the plugin version with \`pressship version patch\` or pass --version before publishing.`
    );
  }
  await mkdir(path.dirname(tagPath), { recursive: true });
  await runSvn(["copy", "trunk", `tags/${version}`], svnDir);
}

async function setAssetMimeTypes(svnDir: string): Promise<void> {
  const assetsDir = path.join(svnDir, "assets");
  if (!pathExists(assetsDir)) {
    return;
  }

  const mimeTypes = new Map([
    [".gif", "image/gif"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"]
  ]);
  const entries = await readdir(assetsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const mimeType = mimeTypes.get(path.extname(entry.name).toLowerCase());
    if (mimeType) {
      await runSvn(["propset", "svn:mime-type", mimeType, path.posix.join("assets", entry.name)], svnDir);
    }
  }
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
  }).catch((error: unknown) => {
    if (isMissingSvnError(error)) {
      throw new Error("`svn` is required for WordPress.org SVN releases. Install Subversion and try again.");
    }
    throw error;
  });

  if (result.failed && result.exitCode === undefined && !result.stderr && !result.stdout) {
    throw new Error("`svn` is required for WordPress.org SVN releases. Install Subversion and try again.");
  }

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `svn ${redactSvnArgs(args).join(" ")} failed.`);
  }

  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

async function runSvnAdd(args: string[], cwd: string): Promise<void> {
  const result = await execa("svn", args, {
    cwd,
    reject: false,
    stdout: "pipe",
    stderr: "pipe"
  }).catch((error: unknown) => {
    if (isMissingSvnError(error)) {
      throw new Error("`svn` is required for WordPress.org SVN releases. Install Subversion and try again.");
    }
    throw error;
  });

  if (result.exitCode === 0 || /already (?:under version control|versioned)/i.test(result.stderr ?? "")) {
    return;
  }

  throw new Error(result.stderr || result.stdout || `svn ${redactSvnArgs(args).join(" ")} failed.`);
}

function toSvnPath(filePath: string): string {
  return filePath.split(path.sep).join("/").replace(/^\.\//, "");
}

function svnCredentialArgs(credentials: SvnCredentials): string[] {
  return [
    "--no-auth-cache",
    "--non-interactive",
    "--username",
    credentials.username,
    "--password",
    credentials.password
  ];
}

function svnCredentialPreviewArgs(username?: string): string[] {
  return username
    ? ["--no-auth-cache", "--non-interactive", "--username", username, "--password", "<saved-svn-password>"]
    : [];
}

function redactSvnArgs(args: string[]): string[] {
  return args.map((arg, index) => (args[index - 1] === "--password" ? "<redacted>" : arg));
}

function isMissingSvnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ("code" in error ? (error as NodeJS.ErrnoException).code === "ENOENT" : /ENOENT|not found/i.test(error.message))
  );
}

function formatCommand(command: CommandPlan): string {
  const prefix = command.cwd ? `(cd ${command.cwd} && ` : "";
  const suffix = command.cwd ? ")" : "";
  return `${prefix}${command.command} ${command.args.map(quoteArg).join(" ")}${suffix}`;
}

function quoteArg(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}
