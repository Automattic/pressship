import { select } from "@inquirer/prompts";
import path from "node:path";
import { z } from "zod";
import { hasSavedSession } from "../auth/session.js";
import { discoverPluginProject, resolvePluginProjectPath } from "../plugin/discover.js";
import { release, svnRepositoryExists, type ReleaseOptions } from "../svn/release.js";
import { ui } from "../ui.js";
import { submit, type SubmitOptions } from "./submit.js";
import { fetchPluginStates, matchesPluginState } from "./state.js";

const publishOptionsSchema = z.object({
  submit: z.boolean().default(false),
  release: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  verify: z.boolean().default(true),
  skipPluginCheck: z.boolean().default(false),
  skipReadmeValidator: z.boolean().default(false),
  outputDir: z.string().optional(),
  wpPath: z.string().optional(),
  ignore: z.array(z.string()).default([]),
  yes: z.boolean().default(false),
  slug: z.string().optional(),
  version: z.string().optional(),
  svnDir: z.string().optional(),
  username: z.string().optional(),
  message: z.string().optional(),
  installSvn: z.boolean().default(true),
  overview: z.string().optional()
});

export type PublishOptions = z.input<typeof publishOptionsSchema>;
export type PublishAction = "submit" | "release" | "prompt";

export type PublishRouteInput = {
  forceSubmit?: boolean;
  forceRelease?: boolean;
  hasPendingSubmission?: boolean;
  svnRepositoryExists?: boolean;
  isLocalSvnWorkingCopy?: boolean;
  canPrompt?: boolean;
};

export type PublishRoute = {
  action: PublishAction;
  reason: string;
};

export async function publish(pluginPath: string | undefined, rawOptions: PublishOptions): Promise<void> {
  const options = publishOptionsSchema.parse(rawOptions);
  const inputDir = path.resolve(pluginPath ?? process.cwd());
  const source = resolvePluginProjectPath(inputDir);
  const rootDir = source.rootDir;

  ui.intro(options.dryRun ? "Dry-run plugin publish" : "Publish plugin");

  if (options.submit || options.release) {
    const route = resolvePublishRoute({
      forceSubmit: options.submit,
      forceRelease: options.release
    });
    if (route.action === "prompt") {
      throw new Error("Forced publish routes cannot require a prompt.");
    }
    ui.info(`Publish target: ${route.action} (${route.reason})`);
    await runPublishAction(route.action, inputDir, rootDir, options);
    return;
  }

  const project = await ui.task("Discovering WordPress plugin", () => discoverPluginProject(rootDir), (value) =>
    `Discovered ${value.headers.pluginName}`
  );

  const [hasPendingSubmission, hasSvnRepository] = await Promise.all([
    detectPendingSubmission(project.slug, project.headers.pluginName),
    detectSvnRepository(options.slug ?? project.slug)
  ]);
  const route = resolvePublishRoute({
    forceSubmit: options.submit,
    forceRelease: options.release,
    hasPendingSubmission,
    svnRepositoryExists: hasSvnRepository,
    isLocalSvnWorkingCopy: Boolean(source.svnRootDir),
    canPrompt: !options.yes && process.stdin.isTTY
  });
  const action = route.action === "prompt" ? await promptPublishAction(route.reason) : route.action;

  ui.info(`Publish target: ${action} (${route.reason})`);
  await runPublishAction(action, inputDir, rootDir, options);
}

async function runPublishAction(
  action: Exclude<PublishAction, "prompt">,
  inputDir: string,
  rootDir: string,
  options: z.infer<typeof publishOptionsSchema>
): Promise<void> {
  if (action === "submit") {
    await submit(rootDir, toSubmitOptions(options));
    return;
  }

  await release(inputDir, toReleaseOptions(options));
}

export function resolvePublishRoute(input: PublishRouteInput): PublishRoute {
  if (input.forceSubmit && input.forceRelease) {
    throw new Error("Choose either `--submit` or `--release`, not both.");
  }

  if (input.forceSubmit) {
    return { action: "submit", reason: "`--submit` was passed" };
  }

  if (input.forceRelease) {
    return { action: "release", reason: "`--release` was passed" };
  }

  if (input.isLocalSvnWorkingCopy) {
    return { action: "release", reason: "local WordPress.org SVN working copy" };
  }

  if (input.hasPendingSubmission) {
    return { action: "submit", reason: "matching WordPress.org submission is pending or reuploadable" };
  }

  if (input.hasPendingSubmission === false && input.svnRepositoryExists) {
    return { action: "release", reason: "WordPress.org SVN repository exists" };
  }

  if (input.svnRepositoryExists === false) {
    return { action: "submit", reason: "WordPress.org SVN repository was not found" };
  }

  if (input.canPrompt) {
    return { action: "prompt", reason: "publish target could not be detected confidently" };
  }

  throw new Error("Could not determine whether to submit or release. Re-run with `--submit` or `--release`.");
}

async function detectPendingSubmission(slug: string, pluginName: string): Promise<boolean | undefined> {
  if (!(await hasSavedSession())) {
    return undefined;
  }

  try {
    const states = await fetchPluginStates();
    return states.some((state) => matchesPluginState(state, slug) || matchesPluginState(state, pluginName));
  } catch (error) {
    ui.warn(
      `Could not inspect WordPress.org pending submissions. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return undefined;
  }
}

async function detectSvnRepository(slug: string): Promise<boolean | undefined> {
  try {
    return await svnRepositoryExists(slug);
  } catch (error) {
    ui.warn(`Could not inspect WordPress.org SVN repository. ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function promptPublishAction(reason: string): Promise<Exclude<PublishAction, "prompt">> {
  const action = await select({
    message: `Choose publish target: ${reason}.`,
    choices: [
      { name: "Submit for WordPress.org review", value: "submit" as const },
      { name: "Release to WordPress.org SVN", value: "release" as const },
      { name: "Cancel", value: "cancel" as const }
    ]
  });

  if (action === "cancel") {
    throw new Error("Publish cancelled.");
  }

  return action;
}

function toSubmitOptions(options: z.infer<typeof publishOptionsSchema>): SubmitOptions {
  return {
    dryRun: options.dryRun,
    verify: options.verify,
    skipPluginCheck: options.skipPluginCheck,
    skipReadmeValidator: options.skipReadmeValidator,
    outputDir: options.outputDir,
    wpPath: options.wpPath,
    ignore: options.ignore,
    yes: options.yes,
    overview: options.overview
  };
}

function toReleaseOptions(options: z.infer<typeof publishOptionsSchema>): ReleaseOptions {
  return {
    slug: options.slug,
    version: options.version,
    svnDir: options.svnDir,
    username: options.username,
    message: options.message,
    dryRun: options.dryRun,
    verify: options.verify,
    skipReadmeValidator: options.skipReadmeValidator,
    wpPath: options.wpPath,
    yes: options.yes,
    ignore: options.ignore,
    installSvn: options.installSvn
  };
}
