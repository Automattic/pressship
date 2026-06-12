import { execa } from "execa";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { discoverPluginProject, resolvePluginProjectPath } from "../plugin/discover.js";
import { isSvnAvailable } from "../svn/subversion.js";
import { pathExists } from "../utils/paths.js";
import type { WebJobContext } from "./jobs.js";

export type ReleaseTag = {
  name: string;
  path?: string;
  isCurrent: boolean;
  isUncommitted: boolean;
  isTrunk?: boolean;
};

export type ReleaseTagList = {
  slug: string;
  svnRootDir?: string;
  currentRef?: string;
  trunk?: ReleaseTag;
  tags: ReleaseTag[];
  source: "local" | "remote" | "unknown";
};

export type ReleaseSwitchConflictResolution = "override" | "revert";

export type ReleaseSwitchTagOptions = {
  conflictResolution?: ReleaseSwitchConflictResolution;
};

/**
 * Lists tag information for the plugin under `pluginPath`.
 *
 * When the plugin has a local SVN working copy, this returns the union of:
 *   - the on-disk `tags/<name>` folders (so we can flag uncommitted local-only
 *     tags), and
 *   - the remote `https://plugins.svn.wordpress.org/<slug>/tags/` listing (so
 *     we can flag tags that exist remotely but are not yet on disk).
 *
 * When no local SVN working copy exists, it falls back to the remote tags only.
 */
export async function listReleaseTags(pluginPath: string): Promise<ReleaseTagList> {
  const projectPath = resolvePluginProjectPath(pluginPath);
  const project = await discoverPluginProject(projectPath.rootDir);
  const svnRootDir = projectPath.svnRootDir;
  const currentRef = await readCurrentSvnRef(projectPath.rootDir, svnRootDir);

  const localTags = await readLocalTagFolders(svnRootDir);
  const remoteTags = await readRemoteTagList(project.slug);
  const trunkTag = svnRootDir
    ? {
        name: "trunk",
        path: path.join(svnRootDir, "trunk"),
        isCurrent: currentRef === "trunk" || currentRef === undefined,
        isUncommitted: false,
        isTrunk: true
      }
    : undefined;

  const allNames = new Set<string>([...localTags.map((entry) => entry.name), ...remoteTags]);
  const tags: ReleaseTag[] = Array.from(allNames)
    .filter((name) => name && name !== "trunk")
    .map((name) => {
      const localEntry = localTags.find((entry) => entry.name === name);
      const remoteHas = remoteTags.includes(name);
      return {
        name,
        path: localEntry?.path,
        isCurrent: currentRef === name,
        isUncommitted: Boolean(localEntry) && !remoteHas
      };
    })
    .sort((a, b) => compareTagNames(a.name, b.name));

  let source: ReleaseTagList["source"];
  if (svnRootDir) {
    source = "local";
  } else if (remoteTags.length > 0) {
    source = "remote";
  } else {
    source = "unknown";
  }

  return {
    slug: project.slug,
    svnRootDir,
    currentRef,
    trunk: trunkTag,
    tags,
    source
  };
}

/**
 * Creates a new local SVN tag by `svn copy trunk tags/<name>`. Requires that
 * the plugin has a local SVN working copy (otherwise the user has nothing to
 * tag locally). The created tag is *uncommitted* — `pressship release` is what
 * pushes it to the remote.
 */
export async function createReleaseTag(pluginPath: string, name: string): Promise<ReleaseTag> {
  const tagName = name.trim();
  if (!tagName) {
    throw new ReleaseError("Tag name is required.", 400);
  }
  if (!/^[A-Za-z0-9_.+\-]+$/.test(tagName)) {
    throw new ReleaseError("Tag name may only contain letters, numbers, dots, underscores, hyphens, and pluses.", 400);
  }
  if (tagName === "trunk") {
    throw new ReleaseError("Reserved tag name.", 400);
  }

  const svnRootDir = await requireLocalSvnRoot(pluginPath);
  await ensureSvnAvailableForRelease();
  await ensureTrunkExists(svnRootDir);

  const targetPath = path.join(svnRootDir, "tags", tagName);
  if (pathExists(targetPath)) {
    throw new ReleaseError(`Tag ${tagName} already exists locally. Delete it first or choose a different name.`, 409);
  }

  if (await remoteTagExists(await readSlugFromWorkingCopy(svnRootDir, pluginPath), tagName)) {
    throw new ReleaseError(`Tag ${tagName} already exists on WordPress.org SVN. Bump the plugin version before tagging.`, 409);
  }

  await mkdir(path.join(svnRootDir, "tags"), { recursive: true });
  await runSvn(["copy", "trunk", `tags/${tagName}`], svnRootDir);

  return {
    name: tagName,
    path: targetPath,
    isCurrent: false,
    isUncommitted: true
  };
}

/**
 * Removes a local-only (uncommitted) tag folder. Refuses to touch committed
 * remote tags — those must go through `svn delete + svn commit` from the CLI.
 */
export async function deleteReleaseTag(pluginPath: string, name: string): Promise<void> {
  const tagName = name.trim();
  if (!tagName || tagName === "trunk") {
    throw new ReleaseError("Refusing to delete trunk.", 400);
  }

  const svnRootDir = await requireLocalSvnRoot(pluginPath);
  const targetPath = path.join(svnRootDir, "tags", tagName);
  if (!pathExists(targetPath)) {
    throw new ReleaseError(`Tag ${tagName} does not exist locally.`, 404);
  }

  const slug = await readSlugFromWorkingCopy(svnRootDir, pluginPath);
  if (await remoteTagExists(slug, tagName)) {
    throw new ReleaseError(
      `Tag ${tagName} is published on WordPress.org SVN and cannot be deleted from Pressship Studio.`,
      409
    );
  }

  await ensureSvnAvailableForRelease();
  const status = await runSvn(["status", path.join("tags", tagName)], svnRootDir, { capture: true });
  if (status.trim()) {
    await runSvn(["revert", "--recursive", path.join("tags", tagName)], svnRootDir);
  }
  await rm(targetPath, { recursive: true, force: true });
}

/**
 * Switches the plugin working copy to point at the given tag (or trunk). Runs
 * `svn switch` so that subsequent edits land on the target ref. Streams output
 * back through the supplied job context so the user sees what svn is doing.
 */
export async function switchReleaseTag(
  pluginPath: string,
  name: string,
  context: WebJobContext,
  options: ReleaseSwitchTagOptions = {}
): Promise<{ ref: string; workingCopy: string }> {
  const tagName = name.trim();
  if (!tagName) {
    throw new ReleaseError("Tag name is required.", 400);
  }

  const projectPath = resolvePluginProjectPath(pluginPath);
  const svnRootDir = projectPath.svnRootDir;
  if (!svnRootDir) {
    throw new ReleaseError(
      "Switching tags requires a local SVN working copy. Clone the plugin with `pressship get` first.",
      409
    );
  }

  await ensureSvnAvailableForRelease();
  const project = await discoverPluginProject(projectPath.rootDir);
  const slug = project.slug;

  // Switching the working copy means changing which URL the *plugin rootDir*
  // (i.e. the working trunk folder discovered by resolvePluginProjectPath)
  // tracks. We never switch the `tags/<name>/` subfolder — that's just the
  // local mirror of an immutable remote tag.
  const workingCopy = projectPath.rootDir;
  if (!pathExists(workingCopy)) {
    throw new ReleaseError(`Working copy ${workingCopy} does not exist on disk.`, 404);
  }

  const localTagDir = tagName === "trunk" ? undefined : path.join(svnRootDir, "tags", tagName);
  const remoteTagReady = tagName === "trunk" ? true : await remoteTagExists(slug, tagName);

  if (tagName !== "trunk") {
    if (localTagDir && pathExists(localTagDir) && !remoteTagReady) {
      throw new ReleaseError(
        `Tag ${tagName} exists locally but is not published on WordPress.org SVN yet. Run a dry-run release to publish it; switching is only available for published tags.`,
        409,
        "local_tag_not_switchable"
      );
    }

    if (!localTagDir || (!pathExists(localTagDir) && !remoteTagReady)) {
      throw new ReleaseError(
        `Tag ${tagName} does not exist locally or on WordPress.org SVN. Create it first.`,
        404
      );
    }
  }

  const refUrl =
    tagName === "trunk"
      ? `https://plugins.svn.wordpress.org/${slug}/trunk`
      : `https://plugins.svn.wordpress.org/${slug}/tags/${tagName}`;

  const status = await readSvnStatus(workingCopy, svnRootDir);
  const shouldRevertBeforeSwitch = options.conflictResolution === "revert" || (!options.conflictResolution && status.trim());
  if (shouldRevertBeforeSwitch) {
    context.status(
      hasSvnStatusConflicts(status)
        ? "Existing SVN conflicts found; reverting the working copy before switching."
        : "Reverting local SVN changes before switching versions."
    );
    await runSvn(["revert", "--recursive", workingCopy], svnRootDir, { logger: context });
  } else if (options.conflictResolution === "override") {
    context.status("Preparing to accept incoming SVN changes for conflicts.");
    await runSvn(["resolve", "--accept", "theirs-conflict", "--depth", "infinity", workingCopy], svnRootDir, {
      allowFailure: true,
      logger: context
    });
  }

  const switchArgs = ["switch", "--ignore-ancestry", "--non-interactive"];
  if (options.conflictResolution === "override") {
    switchArgs.push("--force", "--accept", "theirs-conflict");
  } else {
    switchArgs.push("--accept", "theirs-conflict");
  }
  switchArgs.push(refUrl, workingCopy);

  context.status(`Running svn switch ${refUrl} (working copy: ${workingCopy})`);
  let output = "";
  try {
    output = await runSvn(switchArgs, svnRootDir, { logger: context });
  } catch (error) {
    if (!options.conflictResolution && isSvnConflictError(error)) {
      context.status("SVN reported a conflict; reverting the working copy and retrying the switch.");
      await runSvn(["revert", "--recursive", workingCopy], svnRootDir, { logger: context });
      try {
        output = await runSvn(switchArgs, svnRootDir, { logger: context });
      } catch (retryError) {
        if (isSvnConflictError(retryError)) {
          throw createSwitchConflictError(
            tagName,
            workingCopy,
            retryError instanceof Error ? retryError.message : String(retryError)
          );
        }
        throw retryError;
      }
    } else {
      throw error;
    }
  }
  if (!options.conflictResolution && isSvnConflictOutput(output)) {
    context.status("SVN reported a conflict; reverting the working copy and retrying the switch.");
    await runSvn(["revert", "--recursive", workingCopy], svnRootDir, { logger: context });
    const retryOutput = await runSvn(switchArgs, svnRootDir, { logger: context });
    if (isSvnConflictOutput(retryOutput)) {
      throw createSwitchConflictError(tagName, workingCopy, retryOutput);
    }
    output = retryOutput;
  }

  context.log(`Working copy now tracks ${tagName === "trunk" ? "trunk" : `tags/${tagName}`}.`);
  return { ref: tagName, workingCopy };
}

export type ReleaseBoardEntry = {
  id: string;
  name: string;
  slug: string;
  path: string;
  exists: boolean;
  error?: string;
  localVersion?: string;
  readmeStableTag?: string;
  remoteVersion?: string;
  latestSvnTag?: string;
  statuses: string[];
  releaseBlocked: boolean;
  messages: string[];
};

export class ReleaseError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = "release_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ReleaseSwitchConflictError extends ReleaseError {
  readonly ref: string;
  readonly workingCopy: string;
  readonly output: string;

  constructor(ref: string, workingCopy: string, output: string) {
    super(
      `SVN reported conflicts while switching to ${ref === "trunk" ? "trunk" : `tags/${ref}`}. Choose how Pressship should resolve them.`,
      409,
      "svn_switch_conflict"
    );
    this.ref = ref;
    this.workingCopy = workingCopy;
    this.output = output;
  }
}

async function requireLocalSvnRoot(pluginPath: string): Promise<string> {
  const projectPath = resolvePluginProjectPath(pluginPath);
  const svnRootDir = projectPath.svnRootDir;
  if (!svnRootDir || !pathExists(svnRootDir)) {
    throw new ReleaseError(
      "Release requires an existing WordPress.org SVN working copy. If this is a first-time plugin, submit it first. For an approved plugin, clone it with `pressship get <slug>` and try again.",
      409
    );
  }
  return svnRootDir;
}

async function ensureTrunkExists(svnRootDir: string): Promise<void> {
  if (!pathExists(path.join(svnRootDir, "trunk"))) {
    throw new ReleaseError(
      "Could not find the trunk directory inside the SVN working copy. Run `pressship get <slug>` to refresh it.",
      409
    );
  }
}

async function ensureSvnAvailableForRelease(): Promise<void> {
  if (!(await isSvnAvailable())) {
    throw new ReleaseError(
      "Subversion (`svn`) is required for tag management. Install it and try again.",
      503
    );
  }
}

async function readLocalTagFolders(svnRootDir: string | undefined): Promise<Array<{ name: string; path: string }>> {
  if (!svnRootDir) {
    return [];
  }
  const tagsDir = path.join(svnRootDir, "tags");
  if (!pathExists(tagsDir)) {
    return [];
  }
  const entries = await readdir(tagsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== ".svn")
    .map((entry) => ({ name: entry.name, path: path.join(tagsDir, entry.name) }));
}

async function readRemoteTagList(slug: string): Promise<string[]> {
  if (!(await isSvnAvailable())) {
    return [];
  }
  const result = await execa("svn", ["list", `https://plugins.svn.wordpress.org/${slug}/tags`], {
    reject: false,
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode !== 0) {
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/\/$/, "").trim())
    .filter(Boolean);
}

async function readCurrentSvnRef(rootDir: string, svnRootDir: string | undefined): Promise<string | undefined> {
  if (!svnRootDir) {
    return undefined;
  }
  if (!(await isSvnAvailable())) {
    return undefined;
  }
  const result = await execa("svn", ["info", rootDir], {
    reject: false,
    stdout: "pipe",
    stderr: "pipe"
  });
  if (result.exitCode !== 0) {
    return undefined;
  }
  const match = result.stdout.match(/^URL:\s*(.+)$/im);
  const url = match?.[1]?.trim();
  if (!url) {
    return undefined;
  }
  const tagMatch = url.match(/\/tags\/([^/]+)\/?$/);
  if (tagMatch) {
    return tagMatch[1];
  }
  if (/\/trunk\/?$/.test(url)) {
    return "trunk";
  }
  return undefined;
}

async function readSlugFromWorkingCopy(svnRootDir: string, pluginPath: string): Promise<string> {
  const projectPath = resolvePluginProjectPath(pluginPath);
  const project = await discoverPluginProject(projectPath.rootDir);
  return project.slug || path.basename(svnRootDir);
}

async function remoteTagExists(slug: string, tagName: string): Promise<boolean> {
  if (!(await isSvnAvailable())) {
    return false;
  }
  const result = await execa(
    "svn",
    ["info", `https://plugins.svn.wordpress.org/${slug}/tags/${tagName}`],
    {
      reject: false,
      stdout: "pipe",
      stderr: "pipe"
    }
  );
  return result.exitCode === 0;
}

async function readSvnStatus(workingCopy: string, svnRootDir: string): Promise<string> {
  return runSvn(["status", workingCopy], svnRootDir, { capture: true });
}

function hasSvnStatusConflicts(status: string): boolean {
  return status
    .split(/\r?\n/)
    .some((line) => line.length > 0 && line.slice(0, 7).includes("C"));
}

type RunSvnOptions = {
  allowFailure?: boolean;
  capture?: boolean;
  logger?: Pick<WebJobContext, "log">;
};

async function runSvn(args: string[], cwd: string, options: RunSvnOptions = {}): Promise<string> {
  const result = await execa("svn", args, {
    cwd,
    reject: false,
    stdout: "pipe",
    stderr: "pipe"
  }).catch((error: unknown) => {
    if (isMissingSvnError(error)) {
      throw new ReleaseError("`svn` is required for tag management. Install Subversion and try again.", 503);
    }
    throw error;
  });

  if (result.exitCode !== 0) {
    const message = (result.stderr || result.stdout || `svn ${args.join(" ")} failed.`).trim();
    options.logger?.log(message);
    if (options.allowFailure) {
      return message;
    }
    throw new ReleaseError(message, 500);
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  if (output && options.logger) {
    options.logger.log(output);
  }
  return output;
}

function createSwitchConflictError(ref: string, workingCopy: string, output: string): ReleaseSwitchConflictError {
  return new ReleaseSwitchConflictError(ref, workingCopy, output);
}

function isSvnConflictError(error: unknown): boolean {
  return error instanceof ReleaseError && isSvnConflictOutput(error.message);
}

function isSvnConflictOutput(output: string): boolean {
  return /summary of conflicts|tree conflicts?|text conflicts?|svn:\s*E155015|conflict/i.test(output);
}

function isMissingSvnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ("code" in error
      ? (error as NodeJS.ErrnoException).code === "ENOENT"
      : /ENOENT|not found/i.test(error.message))
  );
}

function compareTagNames(left: string, right: string): number {
  const leftParts = normalizeVersionParts(left);
  const rightParts = normalizeVersionParts(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? -1 : 1;
    }
  }
  return left.localeCompare(right);
}

function normalizeVersionParts(value: string): number[] {
  return value
    .trim()
    .split(/[.-]/)
    .map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
}

/**
 * Sets an explicit plugin version both in the main file header and (when the
 * plugin has one) the readme stable tag. Mirrors what `bumpLocalPluginVersion`
 * in server.ts does, but accepts an arbitrary string instead of patch/minor/
 * major. Validates the version shape so we don't write something readme will
 * reject.
 */
export function isValidExplicitVersion(value: string): boolean {
  return /^\d+(\.\d+){0,3}(?:[-+][A-Za-z0-9.+\-]+)?$/.test(value.trim());
}
