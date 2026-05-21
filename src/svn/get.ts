import { execa } from "execa";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { slugFromHostedTarget } from "../plugin/info.js";
import { ui } from "../ui.js";
import { pathExists } from "../utils/paths.js";
import { ensureSvnAvailable } from "./subversion.js";

const getOptionsSchema = z.object({
  json: z.boolean().default(false),
  installSvn: z.boolean().default(true)
});

export type GetOptions = z.input<typeof getOptionsSchema>;
export type SvnGetRuntimeOptions = {
  installSvn?: boolean;
  interactive?: boolean;
  quiet?: boolean;
};

export type SvnGetAction = "checkout" | "update";

export type SvnInfo = {
  workingCopyRoot?: string;
  url?: string;
  relativeUrl?: string;
  repositoryRoot?: string;
  repositoryUuid?: string;
  revision?: string;
  nodeKind?: string;
  schedule?: string;
  lastChangedAuthor?: string;
  lastChangedRevision?: string;
  lastChangedDate?: string;
};

export type SvnGetResult = {
  slug: string;
  action: SvnGetAction;
  svnUrl: string;
  path: string;
  info: SvnInfo;
  layout: {
    trunk: boolean;
    assets: boolean;
    tags: boolean;
    tagCount: number;
  };
};

export async function getPlugin(slugOrUrl: string, destination: string | undefined, rawOptions: GetOptions = {}): Promise<void> {
  const options = getOptionsSchema.parse(rawOptions);
  const slug = slugFromHostedTarget(slugOrUrl);
  const checkoutPath = resolveCheckoutPath(slug, destination);
  const runtimeOptions = {
    installSvn: options.installSvn,
    interactive: !options.json && process.stdin.isTTY,
    quiet: options.json
  };

  await ensureSvnAvailable({ autoInstall: runtimeOptions.installSvn, interactive: runtimeOptions.interactive });

  const result = options.json
    ? await checkoutOrUpdatePlugin(slug, checkoutPath, runtimeOptions)
    : await ui.task("Preparing SVN working copy", () => checkoutOrUpdatePlugin(slug, checkoutPath, runtimeOptions), (value) =>
        value.action === "checkout" ? `Checked out ${value.slug}` : `Updated ${value.slug}`
      );

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printSvnGetResult(result);
}

export async function checkoutOrUpdatePlugin(
  slug: string,
  checkoutPath: string,
  options: SvnGetRuntimeOptions = {}
): Promise<SvnGetResult> {
  await ensureSvnAvailable({ autoInstall: options.installSvn, interactive: options.interactive });

  const svnUrl = getPluginSvnUrl(slug);
  const action = await resolveSvnGetAction(checkoutPath);
  const commandOptions = { capture: options.quiet };

  if (action === "checkout") {
    await mkdir(path.dirname(checkoutPath), { recursive: true });
    await runSvn(["checkout", svnUrl, checkoutPath], process.cwd(), commandOptions);
  } else {
    await runSvn(["update"], checkoutPath, commandOptions);
  }

  const info = parseSvnInfo(await runSvn(["info"], checkoutPath, { capture: true }));
  return {
    slug,
    action,
    svnUrl,
    path: checkoutPath,
    info,
    layout: await readSvnLayout(checkoutPath)
  };
}

export function resolveCheckoutPath(slug: string, destination: string | undefined): string {
  return path.resolve(destination ?? slug);
}

export function getPluginSvnUrl(slug: string): string {
  return `https://plugins.svn.wordpress.org/${slug}`;
}

export async function resolveSvnGetAction(checkoutPath: string): Promise<SvnGetAction> {
  if (!pathExists(checkoutPath)) {
    return "checkout";
  }

  if (pathExists(path.join(checkoutPath, ".svn"))) {
    return "update";
  }

  const entries = await readdir(checkoutPath);
  if (entries.length === 0) {
    return "checkout";
  }

  throw new Error(
    `Target directory already exists and is not an SVN working copy: ${checkoutPath}. Choose another path or remove the directory.`
  );
}

export function parseSvnInfo(output: string): SvnInfo {
  const values = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([^:]+):\s*(.*)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1].toLowerCase(), match[2]])
  );

  return {
    workingCopyRoot: values["working copy root path"],
    url: values.url,
    relativeUrl: values["relative url"],
    repositoryRoot: values["repository root"],
    repositoryUuid: values["repository uuid"],
    revision: values.revision,
    nodeKind: values["node kind"],
    schedule: values.schedule,
    lastChangedAuthor: values["last changed author"],
    lastChangedRevision: values["last changed rev"],
    lastChangedDate: values["last changed date"]
  };
}

async function readSvnLayout(checkoutPath: string): Promise<SvnGetResult["layout"]> {
  const tagsPath = path.join(checkoutPath, "tags");
  const tagEntries = pathExists(tagsPath) ? await readdir(tagsPath, { withFileTypes: true }) : [];

  return {
    trunk: pathExists(path.join(checkoutPath, "trunk")),
    assets: pathExists(path.join(checkoutPath, "assets")),
    tags: pathExists(tagsPath),
    tagCount: tagEntries.filter((entry) => entry.isDirectory()).length
  };
}

async function runSvn(args: string[], cwd: string, options: { capture?: boolean } = {}): Promise<string> {
  const result = await execa("svn", args, {
    cwd,
    reject: false,
    stdout: options.capture ? "pipe" : "inherit",
    stderr: options.capture ? "pipe" : "inherit"
  }).catch((error: unknown) => {
    if (isMissingSvnError(error)) {
      throw new Error("`svn` is required for `pressship get`. Install Subversion and try again.");
    }
    throw error;
  });

  if (result.failed && result.exitCode === undefined && !result.stderr && !result.stdout) {
    throw new Error("`svn` is required for `pressship get`. Install Subversion and try again.");
  }

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `svn ${args.join(" ")} failed.`);
  }

  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
}

function isMissingSvnError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ("code" in error ? (error as NodeJS.ErrnoException).code === "ENOENT" : /ENOENT|not found/i.test(error.message))
  );
}

function printSvnGetResult(result: SvnGetResult): void {
  ui.section(result.slug);
  ui.keyValue("Action", result.action === "checkout" ? "checked out" : "updated");
  ui.keyValue("SVN", ui.path(result.svnUrl));
  ui.keyValue("Path", ui.path(result.path));
  ui.keyValue("Revision", result.info.revision ?? "unknown");
  ui.keyValue("Last rev", result.info.lastChangedRevision ?? "unknown");
  ui.keyValue("Last author", result.info.lastChangedAuthor ?? "unknown");
  ui.keyValue("Trunk", result.layout.trunk ? ui.value("available") : "missing");
  ui.keyValue("Assets", result.layout.assets ? ui.value("available") : "missing");
  ui.keyValue("Tags", result.layout.tags ? `${result.layout.tagCount}` : "missing");
}
