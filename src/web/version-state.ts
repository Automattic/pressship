import { execa } from "execa";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { discoverPluginProject, resolvePluginProjectPath } from "../plugin/discover.js";
import { fetchHostedPluginInfo } from "../plugin/info.js";
import { pathExists } from "../utils/paths.js";
import { isSvnAvailable } from "../svn/subversion.js";

export type VersionStateStatus =
  | "ready"
  | "duplicate_tag_blocked"
  | "header_readme_mismatch"
  | "remote_newer"
  | "missing_version"
  | "unknown_svn_state";

export type VersionState = {
  slug: string;
  name: string;
  path: string;
  localVersion?: string;
  readmeStableTag?: string;
  remoteVersion?: string;
  latestSvnTag?: string;
  svnTags?: string[];
  svnTagsSource: "local" | "remote" | "unknown";
  statuses: VersionStateStatus[];
  releaseBlocked: boolean;
  messages: string[];
};

export type VersionStateInput = {
  slug: string;
  name: string;
  path: string;
  localVersion?: string;
  readmeStableTag?: string;
  remoteVersion?: string;
  svnTags?: string[];
  svnTagsSource: "local" | "remote" | "unknown";
};

export async function getVersionState(pluginPath: string): Promise<VersionState> {
  const projectPath = resolvePluginProjectPath(pluginPath);
  const project = await discoverPluginProject(projectPath.rootDir);
  const [remoteVersion, svnTagsResult] = await Promise.all([
    fetchHostedPluginInfo(project.slug).then((info) => info.version).catch(() => undefined),
    readSvnTags(project.slug, projectPath.svnRootDir)
  ]);

  return calculateVersionState({
    slug: project.slug,
    name: project.headers.pluginName,
    path: project.rootDir,
    localVersion: project.version,
    readmeStableTag: project.readme?.stableTag,
    remoteVersion,
    svnTags: svnTagsResult.tags,
    svnTagsSource: svnTagsResult.source
  });
}

export function calculateVersionState(input: VersionStateInput): VersionState {
  const statuses: VersionStateStatus[] = [];
  const messages: string[] = [];
  const latestSvnTag = latestVersion(input.svnTags ?? []);

  if (!input.localVersion) {
    statuses.push("missing_version");
    messages.push("The plugin header does not declare a Version value.");
  }

  if (input.localVersion && input.readmeStableTag && input.localVersion !== input.readmeStableTag) {
    statuses.push("header_readme_mismatch");
    messages.push(`The plugin header version (${input.localVersion}) and readme Stable tag (${input.readmeStableTag}) differ.`);
  }

  if (input.localVersion && input.remoteVersion && compareVersions(input.remoteVersion, input.localVersion) > 0) {
    statuses.push("remote_newer");
    messages.push(`WordPress.org has ${input.remoteVersion}, which is newer than the local ${input.localVersion}.`);
  }

  if (input.localVersion && input.svnTags?.includes(input.localVersion)) {
    statuses.push("duplicate_tag_blocked");
    messages.push(`SVN already has a ${input.localVersion} tag. Bump the version before releasing.`);
  }

  if (input.svnTagsSource === "unknown") {
    statuses.push("unknown_svn_state");
    messages.push("Could not read SVN tags, so duplicate release detection is incomplete.");
  }

  if (statuses.length === 0) {
    statuses.push("ready");
    messages.push("Version state looks ready for a guarded publish or release.");
  }

  return {
    ...input,
    latestSvnTag,
    statuses,
    releaseBlocked: statuses.some((status) =>
      ["missing_version", "header_readme_mismatch", "duplicate_tag_blocked"].includes(status)
    ),
    messages
  };
}

export function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left);
  const rightParts = normalizeVersion(right);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }
  return 0;
}

async function readSvnTags(
  slug: string,
  svnRootDir: string | undefined
): Promise<{ tags?: string[]; source: VersionState["svnTagsSource"] }> {
  if (svnRootDir) {
    const tagsPath = path.join(svnRootDir, "tags");
    if (pathExists(tagsPath)) {
      const entries = await readdir(tagsPath, { withFileTypes: true });
      return {
        tags: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(compareVersions),
        source: "local"
      };
    }
  }

  if (!(await isSvnAvailable())) {
    return { source: "unknown" };
  }

  const result = await execa("svn", ["list", `https://plugins.svn.wordpress.org/${slug}/tags`], {
    reject: false,
    stdout: "pipe",
    stderr: "pipe"
  });

  if (result.exitCode !== 0) {
    return { source: "unknown" };
  }

  return {
    tags: result.stdout
      .split(/\r?\n/)
      .map((line) => line.replace(/\/$/, "").trim())
      .filter(Boolean)
      .sort(compareVersions),
    source: "remote"
  };
}

function latestVersion(values: string[]): string | undefined {
  return values.length > 0 ? [...values].sort(compareVersions).at(-1) : undefined;
}

function normalizeVersion(value: string): number[] {
  return value
    .trim()
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}
