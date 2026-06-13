import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { execa } from "execa";
import fg from "fast-glob";
import { z } from "zod";
import { hasSavedSession } from "../auth/session.js";
import { getWordPressOrgAccount } from "../auth/whoami.js";
import { analyzePluginPackage, stagePluginDirectory } from "../package/archive.js";
import {
  addPressshipIgnorePattern,
  createPressshipIgnoreMatcher,
  hardIgnoreDirectories,
  isHardIgnoredPath,
  pressshipIgnoreFile,
  readPressshipIgnorePatterns,
  removePressshipIgnorePattern
} from "../package/ignore.js";
import { createPluginPack, summarizePackResult, validatePluginPack } from "../package/pack.js";
import { discoverPluginProject, resolvePluginProjectPath } from "../plugin/discover.js";
import {
  assertDemoLaunchPlanSupported,
  createDemoLaunchPlan,
  prepareDemoRuntime,
  publicDemoLaunchPlan,
  resetPlaygroundSite
} from "../plugin/demo.js";
import { fetchHostedPluginInfo, getPluginInfo } from "../plugin/info.js";
import { getPluginList } from "../plugin/list.js";
import { bumpVersion, updatePluginHeaderVersion, updateReadmeStableTag, type VersionBump } from "../plugin/version.js";
import { checkoutOrUpdatePlugin, resolveCheckoutPath } from "../svn/get.js";
import { getSavedSvnPassword, getSvnPasswordUrl } from "../svn/credentials.js";
import { createReleaseCommandPlan, svnRepositoryExists } from "../svn/release.js";
import { publish } from "../wordpress-org/publish.js";
import { fetchPluginStates, matchesPluginState } from "../wordpress-org/state.js";
import { runPluginCheck } from "../checks/plugin-check.js";
import { hasBlockingFindings } from "../checks/summary.js";
import { ensureCacheDir, getConfigDir, pathExists } from "../utils/paths.js";
import { addLocalPluginPath, getLocalPlugin, listLocalPlugins, removeLocalPlugin } from "./registry.js";
import { WebJobManager, type WebJobContext } from "./jobs.js";
import { getVersionState } from "./version-state.js";
import {
  createReleaseTag,
  deleteReleaseTag,
  isValidExplicitVersion,
  listReleaseTags,
  ReleaseError,
  ReleaseSwitchConflictError,
  type ReleaseSwitchConflictResolution,
  switchReleaseTag
} from "./release.js";
import { isPortAvailable, resolveFreePort } from "./ports.js";
import { readWebSettings, webSettingsSchema, writeWebSettings, type WebSettings } from "./settings.js";
import {
  createAiAssistantPrompt,
  detectAiAssistance,
  describeAiAssistantRun,
  getAiAssistantHarnesses,
  runAiAssistant,
  isInstalledAiAssistantId,
  type InstalledAiAssistantId
} from "./ai-assistance.js";
import {
  addStudioPluginCheckLineHints,
  normalizeStudioPluginCheckFindings,
  summarizeStudioPluginCheckFindings
} from "./plugin-check.js";
import {
  readStudioPluginCheckState,
  removeStudioPluginCheckFindingsForFiles,
  removeStudioPluginCheckState,
  writeStudioPluginCheckState
} from "./plugin-check-state.js";

const nodeRequire = createRequire(import.meta.url);
const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const spaRoutePrefixes = new Set(["dashboard", "studio", "wordpress.org", "remote", "local", "release", "settings"]);
const addLocalPluginSchema = z.object({ path: z.string().min(1) });
const bumpVersionSchema = z.object({ bump: z.enum(["patch", "minor", "major"]) });
const setVersionSchema = z.object({ version: z.string().min(1) });
const createSvnTagSchema = z.object({ name: z.string().min(1) });
const switchSvnTagSchema = z.object({ conflictResolution: z.enum(["override", "revert"]).optional() });
const ignoreRuleSchema = z.object({ pattern: z.string().min(1) });
const writeStudioFileSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});
const studioAiChangeSchema = z.object({
  path: z.string().min(1),
  status: z.enum(["created", "modified", "deleted"]),
  beforeContent: z.string().optional(),
  afterContent: z.string().optional()
});
type StudioPackageSizeResult = {
  sizeBytes: number;
  maxSizeBytes: number;
  overLimit: boolean;
  fileCount: number;
  topLevelFolder: string;
  largestFiles: Array<{ path: string; sizeBytes: number }>;
};
type StudioPackageSizeCacheEntry = {
  status: "calculating" | "ready" | "error";
  result?: StudioPackageSizeResult;
  error?: string;
  requestedAt: string;
  updatedAt?: string;
  promise?: Promise<void>;
};
const installedAiAssistantSchema = z.custom<InstalledAiAssistantId>(
  (value) => typeof value === "string" && isInstalledAiAssistantId(value),
  { message: "Unknown AI assistant." }
);
const jobSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("clone"),
    slug: z.string().min(1),
    destination: z.string().optional()
  }),
  z.object({
    type: z.literal("play"),
    scope: z.enum(["remote", "local"]),
    id: z.string().min(1),
    wpVersion: z.string().min(1).max(20).optional()
  }),
  z.object({
    type: z.literal("check"),
    localId: z.string().min(1)
  }),
  z.object({
    type: z.literal("ai-chat"),
    localId: z.string().min(1),
    prompt: z.string().min(1),
    assistant: installedAiAssistantSchema.optional(),
    selectedFile: z.string().optional()
  }),
  z.object({
    type: z.literal("dry-run-publish"),
    localId: z.string().min(1),
    action: z.enum(["auto", "submit", "release"]).default("auto")
  }),
  z.object({
    type: z.literal("confirm-publish"),
    approvalId: z.string().min(1),
    overview: z.string().optional()
  }),
  z.object({
    type: z.literal("svn-switch"),
    localId: z.string().min(1),
    tag: z.string().min(1),
    conflictResolution: z.enum(["override", "revert"]).optional()
  })
]);

export type WebServerOptions = {
  host?: string;
  port?: string | number;
  noOpen?: boolean;
  dependencies?: WebServerDependencies;
};

export type WebServerDependencies = {
  runPluginCheck?: typeof runPluginCheck;
  stagePluginDirectory?: typeof stagePluginDirectory;
};

type Approval = {
  id: string;
  localId: string;
  pluginPath: string;
  action: "submit" | "release";
  version?: string;
  ignore?: string[];
  createdAt: number;
};

export type PlaygroundInstance = {
  id: string;
  name: string;
  slug: string;
  source: "local" | "wordpress.org";
  url: string;
  startedAt: string;
  pid?: number;
};

type ManagedPlayground = PlaygroundInstance & {
  child: ChildProcess;
};

type PlaygroundRequestContext = {
  token: string;
  jobs: WebJobManager;
  approvals: Map<string, Approval>;
  playgrounds: Map<string, ManagedPlayground>;
  playgroundPortReservations: Set<number>;
  packageSizeCache: Map<string, StudioPackageSizeCacheEntry>;
  staticDir: string;
  dependencies: WebServerDependencies;
};

export type StartedWebServer = {
  server: Server;
  url: string;
  token: string;
  jobs: WebJobManager;
  close(): Promise<void>;
};

export async function startWebServer(options: WebServerOptions = {}): Promise<StartedWebServer> {
  const host = options.host ?? "127.0.0.1";
  const requestedPort = options.port === undefined ? 9477 : Number(options.port);
  const port = await resolveFreePort(host, requestedPort, options.port !== undefined);
  const token = randomBytes(24).toString("hex");
  const jobs = new WebJobManager();
  const approvals = new Map<string, Approval>();
  const playgrounds = new Map<string, ManagedPlayground>();
  const playgroundPortReservations = new Set<number>();
  const packageSizeCache = new Map<string, StudioPackageSizeCacheEntry>();
  const staticDir = resolveStaticDir();
  const dependencies = options.dependencies ?? {};
  const server = createServer((request, response) => {
    void handleRequest(request, response, {
      token,
      jobs,
      approvals,
      playgrounds,
      playgroundPortReservations,
      packageSizeCache,
      staticDir,
      dependencies
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${boundPort}/`;

  server.on("close", () => {
    jobs.cancelRunningJobs();
    stopPlaygrounds(playgrounds);
    playgroundPortReservations.clear();
  });

  return {
    server,
    url,
    token,
    jobs,
    close: async () => {
      jobs.cancelRunningJobs();
      stopPlaygrounds(playgrounds);
      playgroundPortReservations.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: PlaygroundRequestContext
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (mutationMethods.has(request.method ?? "GET") && request.headers["x-pressship-token"] !== context.token) {
      sendJson(response, 403, { error: { message: "Missing or invalid Pressship Studio token.", code: "invalid_token" } });
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url, context);
      return;
    }

    if (url.pathname.startsWith("/brand/")) {
      await serveBrandAsset(response, url.pathname);
      return;
    }

    if (url.pathname === "/vendor/marked.esm.js") {
      await serveVendorAsset(response, nodeRequire.resolve("marked"));
      return;
    }

    await serveStatic(response, context.staticDir, url.pathname, context.token);
  } catch (error) {
    sendJson(response, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
  }
}

async function serveBrandAsset(response: ServerResponse, requestPath: string): Promise<void> {
  const brandDir = path.resolve(resolveStaticDir(), "..");
  const filePath = path.join(brandDir, path.basename(requestPath));
  if (!filePath.startsWith(brandDir)) {
    sendJson(response, 403, { error: { message: "Forbidden." } });
    return;
  }

  response.writeHead(200, { "Content-Type": contentType(filePath) });
  createReadStream(filePath)
    .on("error", () => sendJson(response, 404, { error: { message: "Not found." } }))
    .pipe(response);
}

async function serveVendorAsset(response: ServerResponse, filePath: string): Promise<void> {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": contentType(filePath)
  });
  createReadStream(filePath)
    .on("error", () => sendJson(response, 404, { error: { message: "Not found." } }))
    .pipe(response);
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: PlaygroundRequestContext
): Promise<void> {
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    const loggedIn = await hasSavedSession();
    const account = loggedIn ? await getWordPressOrgAccount().catch(() => undefined) : undefined;
    const settings = await readWebSettings();
    sendJson(response, 200, {
      token: context.token,
      loggedIn,
      account,
      configDir: getConfigDir(),
      cwd: process.cwd(),
      defaultCheckoutDir: settings.defaultCheckoutDir,
      playgroundPortRange: [settings.playgroundPortStart, settings.playgroundPortEnd],
      settings,
      aiHarnesses: getAiAssistantHarnesses(),
      jobs: context.jobs.list(),
      playgrounds: listPlaygrounds(context.playgrounds)
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/playgrounds") {
    sendJson(response, 200, { playgrounds: listPlaygrounds(context.playgrounds) });
    return;
  }

  if (method === "GET" && url.pathname === "/api/settings") {
    sendJson(response, 200, await readWebSettings());
    return;
  }

  if (method === "GET" && url.pathname === "/api/ai-assistance") {
    sendJson(response, 200, await detectAiAssistance());
    return;
  }

  if (method === "PUT" && url.pathname === "/api/settings") {
    const body = webSettingsSchema.parse(await readJson(request));
    sendJson(response, 200, await writeWebSettings(body));
    return;
  }

  if (method === "POST" && url.pathname === "/api/select-folder") {
    sendJson(response, 200, { path: await selectFolder() });
    return;
  }

  if (method === "GET" && url.pathname === "/api/plugins/remote") {
    sendJson(response, 200, await getPluginList(undefined, { public: false }));
    return;
  }

  if (method === "GET" && url.pathname === "/api/plugins/local") {
    sendJson(response, 200, { plugins: await listLocalPlugins() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/plugins/local") {
    const body = addLocalPluginSchema.parse(await readJson(request));
    sendJson(response, 200, await addLocalPluginPath(body.path, "manual"));
    return;
  }

  const deleteLocalMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)$/);
  if (method === "DELETE" && deleteLocalMatch) {
    const localId = decodeURIComponent(deleteLocalMatch[1]);
    const removed = await removeLocalPlugin(localId);
    if (removed) {
      await removeStudioPluginCheckState(localId);
    }
    sendJson(response, 200, { removed });
    return;
  }

  const detailMatch = url.pathname.match(/^\/api\/plugins\/(remote|local)\/([^/]+)$/);
  if (method === "GET" && detailMatch) {
    sendJson(response, 200, await readPluginDetail(detailMatch[1] as "remote" | "local", decodeURIComponent(detailMatch[2])));
    return;
  }

  const versionMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/version-state$/);
  if (method === "GET" && versionMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(versionMatch[1]));
    sendJson(response, 200, await getVersionState(plugin.path));
    return;
  }

  const studioFilesMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/files$/);
  if (method === "GET" && studioFilesMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioFilesMatch[1]));
    sendJson(response, 200, await listStudioFiles(plugin.path));
    return;
  }

  const studioFilesDirectoryMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/files\/directory$/);
  if (method === "GET" && studioFilesDirectoryMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioFilesDirectoryMatch[1]));
    const relativePath = url.searchParams.get("path") ?? "";
    sendJson(response, 200, await listStudioDirectory(plugin.path, relativePath));
    return;
  }

  const studioIgnoreStateMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/ignore-state$/);
  if (method === "GET" && studioIgnoreStateMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioIgnoreStateMatch[1]));
    sendJson(response, 200, await readStudioIgnoreState(plugin.path));
    return;
  }

  const studioPackageSizeMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/package-size$/);
  if (method === "GET" && studioPackageSizeMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioPackageSizeMatch[1]));
    sendJson(response, 200, readStudioPackageSize(plugin.path, context.packageSizeCache));
    return;
  }

  const studioIgnoreRulesMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/ignore-rules$/);
  if (method === "POST" && studioIgnoreRulesMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioIgnoreRulesMatch[1]));
    const body = ignoreRuleSchema.parse(await readJson(request));
    try {
      await addPressshipIgnorePattern(path.resolve(plugin.path), body.pattern);
      invalidateStudioPackageSize(plugin.path, context.packageSizeCache);
      sendJson(response, 200, await readStudioIgnoreState(plugin.path));
    } catch (error) {
      sendJson(response, 400, {
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: "invalid_ignore_pattern"
        }
      });
    }
    return;
  }

  if (method === "DELETE" && studioIgnoreRulesMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioIgnoreRulesMatch[1]));
    const body = ignoreRuleSchema.parse(await readJson(request));
    try {
      await removePressshipIgnorePattern(path.resolve(plugin.path), body.pattern);
      invalidateStudioPackageSize(plugin.path, context.packageSizeCache);
      sendJson(response, 200, await readStudioIgnoreState(plugin.path));
    } catch (error) {
      sendJson(response, 400, {
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: "invalid_ignore_pattern"
        }
      });
    }
    return;
  }

  const studioCheckStateMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/check-state$/);
  if (method === "GET" && studioCheckStateMatch) {
    const localId = decodeURIComponent(studioCheckStateMatch[1]);
    await requireLocalPlugin(localId);
    sendJson(response, 200, { state: await readStudioPluginCheckState(localId) });
    return;
  }

  const studioFileContentMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/files\/content$/);
  if (method === "GET" && studioFileContentMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioFileContentMatch[1]));
    const relativePath = url.searchParams.get("path") ?? "";
    sendJson(response, 200, await readStudioFile(plugin.path, relativePath));
    return;
  }

  if (method === "PUT" && studioFileContentMatch) {
    const localId = decodeURIComponent(studioFileContentMatch[1]);
    const plugin = await requireLocalPlugin(localId);
    const body = writeStudioFileSchema.parse(await readJson(request));
    const saved = await writeStudioFile(plugin.path, body.path, body.content);
    invalidateStudioPackageSize(plugin.path, context.packageSizeCache);
    sendJson(response, 200, {
      ...saved,
      checkState: await removeStudioPluginCheckFindingsForFiles(localId, [saved.path])
    });
    return;
  }

  const studioAiChangeApplyMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/ai-changes\/apply$/);
  if (method === "POST" && studioAiChangeApplyMatch) {
    const localId = decodeURIComponent(studioAiChangeApplyMatch[1]);
    const plugin = await requireLocalPlugin(localId);
    const body = studioAiChangeSchema.parse(await readJson(request));
    try {
      const applied = await applyStudioAiChange(plugin.path, body);
      invalidateStudioPackageSize(plugin.path, context.packageSizeCache);
      const checkState = await removeStudioPluginCheckFindingsForFiles(localId, [applied.path]);
      sendJson(response, 200, {
        ...applied,
        files: (await listStudioFiles(plugin.path)).files,
        checkState
      });
    } catch (error) {
      if (error instanceof StudioAiChangeConflictError) {
        sendJson(response, 409, { error: { message: error.message, code: "ai_change_conflict" } });
        return;
      }
      throw error;
    }
    return;
  }

  const bumpMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/bump-version$/);
  if (method === "POST" && bumpMatch) {
    const body = bumpVersionSchema.parse(await readJson(request));
    const localId = decodeURIComponent(bumpMatch[1]);
    const plugin = await requireLocalPlugin(localId);
    await bumpLocalPluginVersion(plugin.path, body.bump);
    invalidateStudioPackageSize(plugin.path, context.packageSizeCache);
    await addLocalPluginPath(plugin.path, plugin.source);
    await removeStudioPluginCheckState(localId);
    sendJson(response, 200, { ...(await getVersionState(plugin.path)), checkState: null });
    return;
  }

  const setVersionMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/version$/);
  if (method === "PUT" && setVersionMatch) {
    const body = setVersionSchema.parse(await readJson(request));
    const localId = decodeURIComponent(setVersionMatch[1]);
    const plugin = await requireLocalPlugin(localId);
    const trimmed = body.version.trim();
    if (!isValidExplicitVersion(trimmed)) {
      sendJson(response, 400, {
        error: {
          message: "Version must look like 1, 1.2, 1.2.3, or 1.2.3-beta.",
          code: "invalid_version"
        }
      });
      return;
    }

    try {
      await setLocalPluginVersion(plugin.path, trimmed);
      invalidateStudioPackageSize(plugin.path, context.packageSizeCache);
      await addLocalPluginPath(plugin.path, plugin.source);
      await removeStudioPluginCheckState(localId);
      sendJson(response, 200, { ...(await getVersionState(plugin.path)), checkState: null });
    } catch (error) {
      sendJson(response, 400, {
        error: { message: error instanceof Error ? error.message : String(error), code: "version_update_failed" }
      });
    }
    return;
  }

  const svnTagsListMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/svn-tags$/);
  if (method === "GET" && svnTagsListMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(svnTagsListMatch[1]));
    try {
      sendJson(response, 200, await listReleaseTags(plugin.path));
    } catch (error) {
      sendReleaseError(response, error);
    }
    return;
  }

  if (method === "POST" && svnTagsListMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(svnTagsListMatch[1]));
    const body = createSvnTagSchema.parse(await readJson(request));
    try {
      const tag = await createReleaseTag(plugin.path, body.name);
      sendJson(response, 201, { tag, list: await listReleaseTags(plugin.path) });
    } catch (error) {
      sendReleaseError(response, error);
    }
    return;
  }

  const svnTagOpsMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/svn-tags\/([^/]+)$/);
  if (method === "DELETE" && svnTagOpsMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(svnTagOpsMatch[1]));
    const tagName = decodeURIComponent(svnTagOpsMatch[2]);
    try {
      await deleteReleaseTag(plugin.path, tagName);
      sendJson(response, 200, { deleted: tagName, list: await listReleaseTags(plugin.path) });
    } catch (error) {
      sendReleaseError(response, error);
    }
    return;
  }

  const svnTagSwitchMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/svn-tags\/([^/]+)\/switch$/);
  if (method === "POST" && svnTagSwitchMatch) {
    const localId = decodeURIComponent(svnTagSwitchMatch[1]);
    const tagName = decodeURIComponent(svnTagSwitchMatch[2]);
    const body = switchSvnTagSchema.parse(await readJson(request));
    await requireLocalPlugin(localId);
    const job = context.jobs.create("svn-switch", `Switch to ${tagName}`, (jobContext) =>
      switchReleaseTagJob(localId, tagName, body.conflictResolution, jobContext)
    );
    sendJson(response, 202, job);
    return;
  }

  if (method === "GET" && url.pathname === "/api/release-board") {
    sendJson(response, 200, await buildReleaseBoard());
    return;
  }

  if (method === "POST" && url.pathname === "/api/jobs") {
    const body = jobSchema.parse(await readJson(request));
    const job = createWebJob(
      body,
      context.jobs,
      context.approvals,
      context.playgrounds,
      context.playgroundPortReservations,
      context.dependencies
    );
    sendJson(response, 202, job);
    return;
  }

  const stopPlaygroundMatch = url.pathname.match(/^\/api\/playgrounds\/([^/]+)$/);
  if (method === "DELETE" && stopPlaygroundMatch) {
    sendJson(response, 200, {
      stopped: stopPlayground(context.playgrounds, decodeURIComponent(stopPlaygroundMatch[1]))
    });
    return;
  }

  const jobEventsMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
  if (method === "GET" && jobEventsMatch) {
    if (url.searchParams.get("token") !== context.token) {
      sendJson(response, 403, { error: { message: "Missing or invalid Pressship Studio token.", code: "invalid_token" } });
      return;
    }
    streamJobEvents(response, context.jobs, decodeURIComponent(jobEventsMatch[1]));
    return;
  }

  const cancelJobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/cancel$/);
  if (method === "POST" && cancelJobMatch) {
    sendJson(response, 200, { cancelled: context.jobs.cancel(decodeURIComponent(cancelJobMatch[1])) });
    return;
  }

  sendJson(response, 404, { error: { message: "Not found.", code: "not_found" } });
}

function createWebJob(
  input: z.infer<typeof jobSchema>,
  jobs: WebJobManager,
  approvals: Map<string, Approval>,
  playgrounds: Map<string, ManagedPlayground>,
  playgroundPortReservations: Set<number>,
  dependencies: WebServerDependencies = {}
) {
  if (input.type === "clone") {
    return jobs.create("clone", `Clone/update ${input.slug}`, (context) => clonePluginJob(input, context));
  }

  if (input.type === "play") {
    return jobs.create("play", `Start Playground for ${input.id}`, (context) =>
      playPluginJob(input, playgrounds, playgroundPortReservations, context)
    );
  }

  if (input.type === "check") {
    return jobs.create("check", "Plugin Check", (context) => pluginCheckJob(input.localId, context, dependencies));
  }

  if (input.type === "ai-chat") {
    return jobs.create("ai-chat", "AI Assistance", (context) => aiChatJob(input, context));
  }

  if (input.type === "dry-run-publish") {
    return jobs.create("dry-run-publish", "Dry-run publish", (context) =>
      dryRunPublishJob(input.localId, input.action, approvals, context)
    );
  }

  if (input.type === "svn-switch") {
    return jobs.create("svn-switch", `Switch to ${input.tag}`, (context) =>
      switchReleaseTagJob(input.localId, input.tag, input.conflictResolution, context)
    );
  }

  return jobs.create("confirm-publish", "Confirmed publish", (context) =>
    confirmPublishJob(input.approvalId, input.overview, approvals, context)
  );
}

async function clonePluginJob(
  input: Extract<z.infer<typeof jobSchema>, { type: "clone" }>,
  context: WebJobContext
) {
  const slug = input.slug.replace(/^\/+|\/+$/g, "");
  const settings = await readWebSettings();
  const requestedDestination =
    input.destination ?? path.resolve(settings.defaultCheckoutDir, slug);
  const destination = resolveCheckoutPath(slug, requestedDestination);
  await mkdir(path.dirname(destination), { recursive: true });
  context.status(`Preparing SVN checkout at ${destination}`);
  const result = await checkoutOrUpdatePlugin(slug, destination, {
    installSvn: false,
    interactive: false,
    quiet: true
  });
  context.log(`${result.action === "checkout" ? "Checked out" : "Updated"} ${result.slug}.`, result);
  const plugin = await addLocalPluginPath(result.path, "clone");
  return { result, plugin };
}

async function playPluginJob(
  input: Extract<z.infer<typeof jobSchema>, { type: "play" }>,
  playgrounds: Map<string, ManagedPlayground>,
  playgroundPortReservations: Set<number>,
  context: WebJobContext
) {
  const target = input.scope === "local" ? (await requireLocalPlugin(input.id)).path : input.id;
  const settings = await readWebSettings();
  const port = await reservePlaygroundPort(settings, playgrounds, playgroundPortReservations);
  let child: ChildProcess | undefined;
  let started = false;

  try {
    const wpVersion = input.wpVersion === "latest" ? undefined : input.wpVersion;
    const plan = await createDemoLaunchPlan(target, {
      port: String(port),
      skipBrowser: true,
      reset: false,
      wp: wpVersion,
      database: settings.playgroundDatabaseMode,
      mysqlHost: settings.playgroundMysqlHost,
      mysqlPort: settings.playgroundMysqlPort,
      mysqlUser: settings.playgroundMysqlUser,
      mysqlPassword: settings.playgroundMysqlPassword,
      mysqlDatabasePrefix: settings.playgroundMysqlDatabasePrefix
    });
    if (!plan.url) {
      throw new Error("Could not determine Playground URL.");
    }
    assertDemoLaunchPlanSupported(plan);

    context.status(`Resetting Playground site at ${plan.siteDir}`);
    await resetPlaygroundSite(plan.siteDir);
    if (plan.database.mode === "mysql") {
      context.status(
        `Preparing MySQL database ${plan.database.database} at ${plan.database.host}:${plan.database.port}`
      );
      await prepareDemoRuntime(plan, { resetDatabase: true });
      if (plan.database.server === "managed-docker") {
        context.status(
          `Using managed MariaDB container at ${plan.database.host}:${plan.database.port} for legacy Playground`
        );
      }
    }
    context.status(
      `Starting Playground for ${plan.name} on ${plan.url} ` +
        `(WordPress ${plan.wpVersion ?? "latest"}, PHP ${plan.phpVersion ?? "latest"})`
    );
    const spawned = spawn(plan.command, plan.args, { cwd: plan.cwd, stdio: ["ignore", "pipe", "pipe"] });
    child = spawned;
    context.registerCancel(() => spawned.kill("SIGTERM"));
    spawned.stdout.on("data", (chunk) => context.log(chunk.toString()));
    spawned.stderr.on("data", (chunk) => context.log(chunk.toString()));

    let removeStartupListeners = () => {};
    const exitBeforeReady = new Promise<never>((_resolve, reject) => {
      const onError = (error: Error) => reject(error);
      const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
        reject(new Error(`Playground exited before it was ready (${signal ?? code ?? "unknown"}).`));
      };
      spawned.once("error", onError);
      spawned.once("exit", onExit);
      removeStartupListeners = () => {
        spawned.off("error", onError);
        spawned.off("exit", onExit);
      };
    });

    try {
      await Promise.race([waitForPlaygroundReady(plan.url, context.signal), exitBeforeReady]);
    } finally {
      removeStartupListeners();
    }

    const instance: ManagedPlayground = {
      id: createPlaygroundId(plan.slug, plan.url),
      name: plan.name,
      slug: plan.slug,
      source: plan.source,
      url: plan.url,
      startedAt: new Date().toISOString(),
      pid: spawned.pid,
      child: spawned
    };
    playgrounds.set(instance.id, instance);
    spawned.once("exit", () => {
      playgrounds.delete(instance.id);
      playgroundPortReservations.delete(port);
    });
    started = true;

    context.status(`Playground is ready at ${plan.url}`);
    return {
      url: plan.url,
      urls: playgroundUrls(plan.url),
      credentials: {
        username: "admin",
        password: "password"
      },
      playground: publicPlayground(instance),
      plan: publicDemoLaunchPlan(plan)
    };
  } catch (error) {
    if (!started) {
      child?.kill("SIGTERM");
      playgroundPortReservations.delete(port);
    }
    throw error;
  }
}

async function pluginCheckJob(
  localId: string,
  context: WebJobContext,
  dependencies: WebServerDependencies = {}
) {
  const local = await requireLocalPlugin(localId);
  const source = resolvePluginProjectPath(local.path);
  const project = await discoverPluginProject(source.rootDir);
  const stagePlugin = dependencies.stagePluginDirectory ?? stagePluginDirectory;
  const pluginChecker = dependencies.runPluginCheck ?? runPluginCheck;
  const stageRoot = await mkdtemp(path.join(tmpdir(), "pressship-studio-check-"));

  context.status(`Running WordPress.org Plugin Check for ${project.headers.pluginName}.`);
  try {
    const checkTarget = await stagePlugin(project, { outputDir: stageRoot });
    const result = await pluginChecker(checkTarget.path, { mode: "new" });
    const findings = await addStudioPluginCheckLineHints(
      normalizeStudioPluginCheckFindings(result.findings, checkTarget.path, project.slug),
      source.rootDir
    );
    const summary = summarizeStudioPluginCheckFindings(findings);
    const checkedAt = new Date().toISOString();
    const persisted = await writeStudioPluginCheckState({
      pluginId: local.id,
      pluginPath: local.path,
      slug: local.slug,
      name: local.name,
      skipped: result.skipped,
      available: result.available,
      findings,
      summary,
      checkedAt
    });
    context.log(
      `Plugin Check finished: ${summary.error} errors, ${summary.warning} warnings, ${summary.info} info.`
    );

    return {
      plugin: {
        id: local.id,
        name: local.name,
        slug: local.slug,
        path: local.path
      },
      skipped: result.skipped,
      available: result.available,
      findings,
      summary,
      checkedAt: persisted.checkedAt,
      rawOutput: result.rawOutput
    };
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}

async function aiChatJob(
  input: Extract<z.infer<typeof jobSchema>, { type: "ai-chat" }>,
  context: WebJobContext
) {
  const local = await requireLocalPlugin(input.localId);
  const source = resolvePluginProjectPath(local.path);
  const settings = await readWebSettings();
  const assistant = input.assistant ?? settings.aiAssistant;

  if (assistant === "none") {
    throw new Error("Choose an AI assistant in Settings before starting chat.");
  }

  const selectedAssistant = assistant as InstalledAiAssistantId;
  const before = await snapshotStudioFileContents(source.rootDir);
  const workspace = await createStudioAiPreviewWorkspace(source.rootDir);
  const pluginCheck = await readStudioPluginCheckState(local.id);
  const prompt = createAiAssistantPrompt({
    pluginPath: workspace.path,
    selectedFile: input.selectedFile,
    userPrompt: input.prompt,
    pluginCheck
  });

  context.status(`Starting ${selectedAssistant} in a review workspace.`);
  context.status(
    pluginCheck?.summary
      ? `Included Plugin Check context: ${pluginCheck.summary.error} errors, ${pluginCheck.summary.warning} warnings.`
      : "Included Plugin Check context: no saved check result."
  );
  try {
    const run = await runAiAssistant(selectedAssistant, prompt, {
      cwd: workspace.path,
      signal: context.signal,
      onEvent(event) {
        if (event.type === "chunk" && event.text) {
          context.log(event.text);
        }
      }
    });
    const after = await snapshotStudioFileContents(workspace.path);
    const changedFiles = diffStudioFileContents(before, after);
    if (changedFiles.length) {
      context.log(`AI proposed ${changedFiles.length} patch${changedFiles.length === 1 ? "" : "es"}.`, {
        proposedChanges: changedFiles.map((file) => ({
          path: file.path,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions
        }))
      });
    }

    return {
      assistant: run.provider,
      command: describeAiAssistantRun(run),
      exitCode: run.exitCode,
      timedOut: run.timedOut,
      aborted: run.aborted,
      plugin: {
        id: local.id,
        name: local.name,
        slug: local.slug,
        path: source.rootDir
      },
      selectedFile: input.selectedFile,
      changedFiles
    };
  } finally {
    await rm(workspace.root, { recursive: true, force: true });
  }
}

async function dryRunPublishJob(
  localId: string,
  requestedAction: "auto" | "submit" | "release",
  approvals: Map<string, Approval>,
  context: WebJobContext
) {
  const local = await requireLocalPlugin(localId);
  const source = resolvePluginProjectPath(local.path);
  const project = await discoverPluginProject(source.rootDir);
  context.status(`Discovered ${project.headers.pluginName}.`);

  const route = await detectPublishRoute(source.inputDir, source.rootDir, project.slug, project.headers.pluginName, requestedAction);
  context.log(`Publish target: ${route.action} (${route.reason})`);

  const versionState = await getVersionState(source.rootDir);
  if (route.action === "release" && versionState.releaseBlocked) {
    context.log("Release is blocked by version state.", versionState);
  }

  const ignorePatterns = await readPressshipIgnorePatterns(source.rootDir);
  context.status("Validating package.");
  const validation = await validatePluginPack(project, { ignore: ignorePatterns });
  const validationBlocked = hasBlockingFindings(validation.readmeFindings) || hasBlockingFindings(validation.pluginCheckFindings);
  const cacheDir = path.join(await ensureCacheDir(), "studio-packages");
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const pack = summarizePackResult(await createPluginPack(source.rootDir, { outputDir: cacheDir, ignore: ignorePatterns }), validation);
  const releasePlan =
    route.action === "release"
      ? createReleaseCommandPlan(
          project.slug,
          path.resolve(source.svnRootDir ?? path.join(process.cwd(), ".pressship-svn", project.slug)),
          project.version ?? "unknown",
          `Release ${project.slug} ${project.version ?? "unknown"}`,
          await inferWordPressOrgUsername()
        )
      : undefined;
  const canConfirm = !validationBlocked && !(route.action === "release" && versionState.releaseBlocked);
  const approval = canConfirm
    ? createApproval(approvals, {
        localId,
        pluginPath: source.inputDir,
        action: route.action,
        version: project.version,
        ignore: ignorePatterns
      })
    : undefined;

  return {
    route,
    versionState,
    validation,
    validationBlocked,
    package: pack,
    releasePlan,
    approvalId: approval?.id,
    canConfirm
  };
}

async function confirmPublishJob(
  approvalId: string,
  overview: string | undefined,
  approvals: Map<string, Approval>,
  context: WebJobContext
) {
  const approval = approvals.get(approvalId);
  if (!approval || Date.now() - approval.createdAt > 20 * 60 * 1000) {
    throw new Error("This publish approval is missing or expired. Run a fresh dry-run first.");
  }

  const project = await discoverPluginProject(resolvePluginProjectPath(approval.pluginPath).rootDir);
  if (approval.version !== project.version) {
    throw new Error("The plugin version changed after the dry-run. Run a fresh dry-run before publishing.");
  }

  if (approval.action === "release") {
    await assertWebReleaseCredentials(project.slug);
  }

  context.status(`Running confirmed ${approval.action}.`);
  await publish(approval.pluginPath, {
    dryRun: false,
    verify: true,
    yes: true,
    submit: approval.action === "submit",
    release: approval.action === "release",
    ignore: approval.ignore ?? [],
    overview: overview ?? project.headers.description ?? ""
  });
  approvals.delete(approvalId);
  return { action: approval.action, slug: project.slug, version: project.version };
}

async function readPluginDetail(scope: "remote" | "local", id: string) {
  if (scope === "local") {
    const plugin = await requireLocalPlugin(id);
    const info = await getPluginInfo(plugin.path);
    return {
      plugin,
      info,
      readme: info.source === "local" && info.readmePath ? await readTextFile(info.readmePath) : undefined
    };
  }

  const info = await fetchHostedPluginInfo(id);
  return {
    info,
    readme: await fetchHostedReadme(id).catch(() => undefined)
  };
}

const studioHiddenFilePatterns = [
  "**/.git/**",
  "**/.svn/**",
  "**/node_modules/**",
  "**/vendor/**",
  "**/build/**",
  "**/dist/**",
  "**/playground/**",
  "**/.wordpress-playground/**"
];

const maxStudioEditableFileBytes = 1_000_000;
const studioAlwaysHiddenDirectoryNames = new Set([".git"]);
const studioDeferredDirectoryNames = new Set([
  ...hardIgnoreDirectories,
  "vendor",
  ".wordpress-playground",
  "playground"
]);
const studioDeferredDirectoryPatterns = Array.from(studioDeferredDirectoryNames).flatMap((directory) => [
  `${directory}/**`,
  `**/${directory}/**`
]);
const studioEditableExtensions = new Set([
  ".php",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".css",
  ".scss",
  ".sass",
  ".html",
  ".htm",
  ".json",
  ".md",
  ".txt",
  ".xml",
  ".yml",
  ".yaml",
  ".po",
  ".pot",
  ".ini",
  ".sh",
  ".svg"
]);
const studioEditableFileNames = new Set([
  "composer.json",
  "package.json",
  "readme.txt",
  "license",
  "license.txt",
  pressshipIgnoreFile
]);

async function listStudioFiles(pluginPath: string) {
  const root = path.resolve(pluginPath);
  const patterns = await readPressshipIgnorePatterns(root);
  const matcher = createPressshipIgnoreMatcher(patterns);
  const [files, deferredDirectories, ignoredDirectories] = await Promise.all([
    fg("**/*", {
      cwd: root,
      onlyFiles: true,
      dot: true,
      unique: true,
      ignore: studioDeferredDirectoryPatterns
    }),
    listStudioDeferredDirectories(root, matcher),
    listStudioIgnoredPatternDirectories(root, patterns, matcher)
  ]);
  const directories = mergeStudioDirectoryEntries([...deferredDirectories, ...ignoredDirectories]);

  const entries = await Promise.all(
    files.sort((a, b) => a.localeCompare(b)).map(async (relativePath) => {
      const fileStats = await stat(path.join(root, relativePath));
      const ignoredBy = matcher.ignoredBy(relativePath);
      return {
        path: relativePath,
        name: path.basename(relativePath),
        directory: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath),
        size: fileStats.size,
        hardIgnored: isHardIgnoredPath(relativePath),
        ignored: Boolean(ignoredBy),
        ignoredBy
      };
    })
  );

  return { files: entries, directories };
}

async function listStudioDirectory(pluginPath: string, relativePath: string) {
  const root = path.resolve(pluginPath);
  const normalized = normalizeStudioRelativePath(relativePath);
  if (!normalized) {
    throw new Error("Choose a folder first.");
  }
  if (studioExplorerDirectoryIsAlwaysHidden(normalized)) {
    return { files: [], directories: [] };
  }

  const directoryPath = path.resolve(root, normalized);
  if (directoryPath !== root && !directoryPath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Folder is outside the plugin directory.");
  }

  const directoryStats = await stat(directoryPath);
  if (!directoryStats.isDirectory()) {
    throw new Error("Studio can only load folders.");
  }

  const patterns = await readPressshipIgnorePatterns(root);
  const matcher = createPressshipIgnoreMatcher(patterns);
  const ignoredBy = studioIgnoredBy(normalized, matcher);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: Array<{
    path: string;
    name: string;
    directory: string;
    size: number;
    hardIgnored: boolean;
    ignored: boolean;
    ignoredBy?: string;
  }> = [];
  const directories: Array<{
    path: string;
    name: string;
    directory: string;
    deferred: boolean;
    ignored: boolean;
    ignoredBy?: string;
    hardIgnored: boolean;
  }> = [
    {
      path: normalized,
      name: path.basename(normalized),
      directory: path.dirname(normalized) === "." ? "" : path.dirname(normalized),
      deferred: false,
      ignored: Boolean(ignoredBy),
      ignoredBy,
      hardIgnored: isHardIgnoredPath(normalized)
    }
  ];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const childPath = `${normalized}/${entry.name}`;
    if (studioExplorerDirectoryIsAlwaysHidden(childPath)) {
      continue;
    }

    const childIgnoredBy = studioIgnoredBy(childPath, matcher);
    if (entry.isDirectory()) {
      directories.push({
        path: childPath,
        name: entry.name,
        directory: normalized,
        deferred: true,
        ignored: Boolean(childIgnoredBy),
        ignoredBy: childIgnoredBy,
        hardIgnored: isHardIgnoredPath(childPath)
      });
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const fileStats = await stat(path.join(directoryPath, entry.name));
    files.push({
      path: childPath,
      name: entry.name,
      directory: normalized,
      size: fileStats.size,
      hardIgnored: isHardIgnoredPath(childPath),
      ignored: Boolean(childIgnoredBy),
      ignoredBy: childIgnoredBy
    });
  }

  return { files, directories };
}

async function listStudioDeferredDirectories(root: string, matcher: ReturnType<typeof createPressshipIgnoreMatcher>) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) =>
      entry.isDirectory() &&
      studioDeferredDirectoryNames.has(entry.name) &&
      !studioExplorerDirectoryIsAlwaysHidden(entry.name)
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const ignoredBy = isHardIgnoredPath(entry.name)
        ? "Pressship package rules"
        : matcher.ignoredBy(entry.name) ?? matcher.ignoredBy(`${entry.name}/.pressship-directory`);
      return {
        path: entry.name,
        name: entry.name,
        directory: "",
        deferred: true,
        ignored: Boolean(ignoredBy),
        ignoredBy,
        hardIgnored: isHardIgnoredPath(entry.name)
      };
    });
}

async function listStudioIgnoredPatternDirectories(
  root: string,
  patterns: string[],
  matcher: ReturnType<typeof createPressshipIgnoreMatcher>
) {
  const candidates = Array.from(new Set(patterns.flatMap(studioIgnoredDirectoryCandidates)));
  const entries = await Promise.all(
    candidates.map(async (relativePath) => {
      if (studioExplorerDirectoryIsAlwaysHidden(relativePath)) {
        return undefined;
      }
      const absolutePath = path.join(root, relativePath);
      if (!pathExists(absolutePath)) {
        return undefined;
      }
      const entryStats = await stat(absolutePath);
      if (!entryStats.isDirectory()) {
        return undefined;
      }
      const ignoredBy = matcher.ignoredBy(relativePath) ?? matcher.ignoredBy(`${relativePath}/.pressship-directory`);
      if (!ignoredBy) {
        return undefined;
      }
      return {
        path: relativePath,
        name: path.basename(relativePath),
        directory: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath),
        deferred: false,
        ignored: true,
        ignoredBy,
        hardIgnored: isHardIgnoredPath(relativePath)
      };
    })
  );

  return entries
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function studioIgnoredDirectoryCandidates(pattern: string): string[] {
  const trimmed = pattern.trim();
  if (!trimmed || trimmed.startsWith("!")) {
    return [];
  }

  let candidate = "";
  if (trimmed.endsWith("/**")) {
    candidate = trimmed.slice(0, -3);
  } else if (trimmed.endsWith("/")) {
    candidate = trimmed.slice(0, -1);
  } else if (!hasStudioGlobMagic(trimmed)) {
    candidate = trimmed;
  }

  candidate = candidate.replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (!candidate || candidate === "." || hasStudioGlobMagic(candidate)) {
    return [];
  }

  return [candidate];
}

function hasStudioGlobMagic(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

function studioIgnoredBy(relativePath: string, matcher: ReturnType<typeof createPressshipIgnoreMatcher>): string | undefined {
  return isHardIgnoredPath(relativePath)
    ? "Pressship package rules"
    : matcher.ignoredBy(relativePath);
}

function studioExplorerDirectoryIsAlwaysHidden(relativePath: string): boolean {
  return relativePath
    .split("/")
    .filter(Boolean)
    .some((segment) => studioAlwaysHiddenDirectoryNames.has(segment));
}

function mergeStudioDirectoryEntries<T extends {
  path: string;
  ignored?: boolean;
  ignoredBy?: string;
  deferred?: boolean;
  hardIgnored?: boolean;
}>(entries: T[]): T[] {
  const merged = new Map<string, T>();
  for (const entry of entries) {
    const existing = merged.get(entry.path);
    if (!existing) {
      merged.set(entry.path, entry);
      continue;
    }

    merged.set(entry.path, {
      ...existing,
      ...entry,
      deferred: Boolean(existing.deferred || entry.deferred),
      ignored: Boolean(existing.ignored || entry.ignored),
      ignoredBy: existing.hardIgnored ? existing.ignoredBy : entry.ignoredBy ?? existing.ignoredBy,
      hardIgnored: Boolean(existing.hardIgnored || entry.hardIgnored)
    });
  }

  return Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path));
}

async function readStudioIgnoreState(pluginPath: string) {
  const root = path.resolve(pluginPath);
  const patterns = await readPressshipIgnorePatterns(root);
  const ignoredFiles = await listStudioIgnoredFiles(root, patterns);

  return {
    ignorePath: path.join(root, pressshipIgnoreFile),
    patterns,
    ignoredFiles
  };
}

async function listStudioIgnoredFiles(root: string, patterns: string[]) {
  if (!patterns.length) {
    return [];
  }

  const matcher = createPressshipIgnoreMatcher(patterns);
  const files = await fg("**/*", {
    cwd: root,
    onlyFiles: true,
    dot: false,
    unique: true,
    ignore: studioHiddenFilePatterns
  });
  const ignored = files
    .map((relativePath) => ({ relativePath, ignoredBy: matcher.ignoredBy(relativePath) }))
    .filter((entry): entry is { relativePath: string; ignoredBy: string } => Boolean(entry.ignoredBy));

  const entries = await Promise.all(
    ignored.sort((a, b) => a.relativePath.localeCompare(b.relativePath)).map(async ({ relativePath, ignoredBy }) => {
      const fileStats = await stat(path.join(root, relativePath));
      return {
        path: relativePath,
        name: path.basename(relativePath),
        directory: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath),
        size: fileStats.size,
        ignoredBy
      };
    })
  );

  return entries;
}

function readStudioPackageSize(pluginPath: string, cache: Map<string, StudioPackageSizeCacheEntry>) {
  const source = resolvePluginProjectPath(pluginPath);
  const key = source.rootDir;
  const cached = cache.get(key);
  if (cached) {
    return publicStudioPackageSizeEntry(cached);
  }

  const entry: StudioPackageSizeCacheEntry = {
    status: "calculating",
    requestedAt: new Date().toISOString()
  };
  cache.set(key, entry);
  entry.promise = calculateStudioPackageSize(source.rootDir)
    .then((result) => {
      entry.status = "ready";
      entry.result = result;
      entry.error = undefined;
      entry.updatedAt = new Date().toISOString();
    })
    .catch((error) => {
      entry.status = "error";
      entry.error = error instanceof Error ? error.message : String(error);
      entry.updatedAt = new Date().toISOString();
    });

  return publicStudioPackageSizeEntry(entry);
}

function invalidateStudioPackageSize(pluginPath: string, cache: Map<string, StudioPackageSizeCacheEntry>) {
  cache.delete(resolvePluginProjectPath(pluginPath).rootDir);
}

async function calculateStudioPackageSize(rootDir: string): Promise<StudioPackageSizeResult> {
  const project = await discoverPluginProject(rootDir);
  const ignorePatterns = await readPressshipIgnorePatterns(rootDir);
  const analysis = await analyzePluginPackage(project, { ignore: ignorePatterns });

  return {
    sizeBytes: analysis.sizeBytes,
    maxSizeBytes: analysis.maxSizeBytes,
    overLimit: analysis.overLimit,
    fileCount: analysis.files.length,
    topLevelFolder: analysis.topLevelFolder,
    largestFiles: analysis.largestFiles
  };
}

function publicStudioPackageSizeEntry(entry: StudioPackageSizeCacheEntry) {
  if (entry.status === "ready" && entry.result) {
    return {
      status: "ready",
      cached: true,
      calculatedAt: entry.updatedAt,
      ...entry.result
    };
  }
  if (entry.status === "error") {
    return {
      status: "error",
      cached: true,
      error: entry.error ?? "Package size could not be calculated.",
      calculatedAt: entry.updatedAt
    };
  }
  return {
    status: "calculating",
    cached: false,
    requestedAt: entry.requestedAt
  };
}

async function readStudioFile(pluginPath: string, relativePath: string) {
  const filePath = await resolveStudioFilePath(pluginPath, relativePath);
  return {
    path: normalizeStudioRelativePath(relativePath),
    content: await readFile(filePath, "utf8")
  };
}

async function writeStudioFile(pluginPath: string, relativePath: string, content: string) {
  const filePath = await resolveStudioFilePath(pluginPath, relativePath);
  await writeFile(filePath, content, "utf8");
  const fileStats = await stat(filePath);
  return {
    path: normalizeStudioRelativePath(relativePath),
    size: fileStats.size,
    savedAt: new Date().toISOString()
  };
}

async function applyStudioAiChange(pluginPath: string, change: StudioAiChangeInput) {
  const normalizedPath = normalizeStudioRelativePath(change.path);
  const filePath = resolveStudioWritableFilePath(pluginPath, normalizedPath);
  const currentContent = await readStudioFileIfExists(filePath);

  if (change.status === "created") {
    if (currentContent !== undefined) {
      throw new StudioAiChangeConflictError(`${normalizedPath} already exists. Reload the file before applying this patch.`);
    }
    if (change.afterContent === undefined) {
      throw new Error("Created AI patches must include replacement content.");
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, change.afterContent, "utf8");
    const fileStats = await stat(filePath);
    return {
      path: normalizedPath,
      status: change.status,
      size: fileStats.size,
      appliedAt: new Date().toISOString()
    };
  }

  if (currentContent === undefined) {
    throw new StudioAiChangeConflictError(`${normalizedPath} no longer exists. Reload the file before applying this patch.`);
  }

  if (change.beforeContent === undefined || currentContent !== change.beforeContent) {
    throw new StudioAiChangeConflictError(`${normalizedPath} changed since the AI patch was created. Reload before applying.`);
  }

  if (change.status === "deleted") {
    await unlink(filePath);
    return {
      path: normalizedPath,
      status: change.status,
      appliedAt: new Date().toISOString()
    };
  }

  if (change.afterContent === undefined) {
    throw new Error("Modified AI patches must include replacement content.");
  }

  await writeFile(filePath, change.afterContent, "utf8");
  const fileStats = await stat(filePath);
  return {
    path: normalizedPath,
    status: change.status,
    size: fileStats.size,
    appliedAt: new Date().toISOString()
  };
}

function resolveStudioWritableFilePath(pluginPath: string, relativePath: string): string {
  const root = path.resolve(pluginPath);
  if (!relativePath) {
    throw new Error("Choose a file first.");
  }

  const filePath = path.resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("File is outside the plugin directory.");
  }

  return filePath;
}

async function readStudioFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw new StudioAiChangeConflictError("The patch target is not a file.");
    }
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function resolveStudioFilePath(pluginPath: string, relativePath: string): Promise<string> {
  const root = path.resolve(pluginPath);
  const normalized = normalizeStudioRelativePath(relativePath);
  if (!normalized) {
    throw new Error("Choose a file first.");
  }

  const filePath = path.resolve(root, normalized);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("File is outside the plugin directory.");
  }

  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    throw new Error("Studio can only open files.");
  }
  if (fileStats.size > maxStudioEditableFileBytes) {
    throw new Error(
      `Studio can list ${normalized}, but files larger than 1 MB are not opened in the editor.`
    );
  }

  return filePath;
}

function normalizeStudioRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter(Boolean).join("/");
}

function isStudioEditablePath(relativePath: string): boolean {
  const name = path.basename(relativePath).toLowerCase();
  return studioEditableFileNames.has(name) || studioEditableExtensions.has(path.extname(name));
}

async function selectFolder(): Promise<string> {
  if (process.platform === "darwin") {
    const result = await execa("osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Choose a WordPress plugin folder")'
    ]);
    return result.stdout.trim().replace(/\/$/, "");
  }

  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      '$dialog.Description = "Choose a WordPress plugin folder"',
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath } else { exit 1 }"
    ].join("; ");
    const result = await execa("powershell", ["-NoProfile", "-Command", script]);
    return result.stdout.trim();
  }

  try {
    const result = await execa("zenity", ["--file-selection", "--directory", "--title=Choose a WordPress plugin folder"]);
    return result.stdout.trim();
  } catch {
    const result = await execa("kdialog", ["--getexistingdirectory", process.cwd(), "Choose a WordPress plugin folder"]);
    return result.stdout.trim();
  }
}

async function reservePlaygroundPort(
  settings: WebSettings,
  playgrounds: Map<string, ManagedPlayground>,
  playgroundPortReservations: Set<number>
): Promise<number> {
  for (let port = settings.playgroundPortStart; port <= settings.playgroundPortEnd; port += 1) {
    if (isPlaygroundPortReserved(port, playgrounds, playgroundPortReservations)) {
      continue;
    }

    playgroundPortReservations.add(port);
    if (await isPortAvailable("127.0.0.1", port)) {
      return port;
    }
    playgroundPortReservations.delete(port);
  }

  throw new Error(
    `No available Playground port found between ${settings.playgroundPortStart} and ${settings.playgroundPortEnd}.`
  );
}

function isPlaygroundPortReserved(
  port: number,
  playgrounds: Map<string, ManagedPlayground>,
  playgroundPortReservations: Set<number>
): boolean {
  return (
    playgroundPortReservations.has(port) ||
    Array.from(playgrounds.values()).some((playground) => playgroundPort(playground.url) === port)
  );
}

function playgroundPort(url: string): number | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.port) {
      return Number(parsed.port);
    }
    if (parsed.protocol === "http:") {
      return 80;
    }
    if (parsed.protocol === "https:") {
      return 443;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function waitForPlaygroundReady(url: string, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + 120_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new Error("Playground start was cancelled.");
    }

    try {
      const response = await fetch(url, { signal });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new Error(
    `Timed out waiting for Playground at ${url}. ${
      lastError instanceof Error ? lastError.message : String(lastError ?? "")
    }`
  );
}

function listPlaygrounds(playgrounds: Map<string, ManagedPlayground>): PlaygroundInstance[] {
  return Array.from(playgrounds.values()).map(publicPlayground);
}

function publicPlayground(playground: ManagedPlayground): PlaygroundInstance {
  return {
    id: playground.id,
    name: playground.name,
    slug: playground.slug,
    source: playground.source,
    url: playground.url,
    startedAt: playground.startedAt,
    pid: playground.pid
  };
}

function stopPlaygrounds(playgrounds: Map<string, ManagedPlayground>): void {
  for (const playground of playgrounds.values()) {
    playground.child.kill("SIGTERM");
  }
  playgrounds.clear();
}

function stopPlayground(playgrounds: Map<string, ManagedPlayground>, id: string): boolean {
  const playground = playgrounds.get(id);
  if (!playground) {
    return false;
  }

  playground.child.kill("SIGTERM");
  playgrounds.delete(id);
  return true;
}

function createPlaygroundId(slug: string, url: string): string {
  return createHash("sha256").update(`${slug}:${url}:${Date.now()}`).digest("hex").slice(0, 16);
}

function playgroundUrls(baseUrl: string): { home: string; admin: string } {
  const home = new URL("/", baseUrl);
  const admin = new URL("/wp-admin/", baseUrl);
  admin.searchParams.set("pressship_auto_login", "1");
  return {
    home: home.toString().replace(/\/$/, ""),
    admin: admin.toString()
  };
}

async function bumpLocalPluginVersion(pluginPath: string, bump: VersionBump): Promise<string> {
  const project = await discoverPluginProject(pluginPath);
  if (!project.version) {
    throw new Error("Could not find a Version header in the main plugin file.");
  }
  const nextVersion = bumpVersion(project.version, bump);
  await updatePluginHeaderVersion(project.mainFile, nextVersion);
  if (project.readmePath) {
    await updateReadmeStableTag(project.readmePath, nextVersion);
  }
  return nextVersion;
}

async function setLocalPluginVersion(pluginPath: string, nextVersion: string): Promise<string> {
  const project = await discoverPluginProject(pluginPath);
  await updatePluginHeaderVersion(project.mainFile, nextVersion);
  if (project.readmePath) {
    await updateReadmeStableTag(project.readmePath, nextVersion);
  }
  return nextVersion;
}

async function switchReleaseTagJob(
  localId: string,
  tagName: string,
  conflictResolution: ReleaseSwitchConflictResolution | undefined,
  context: WebJobContext
): Promise<{ ref: string; slug: string; workingCopy: string; checkState: null } | {
  conflict: true;
  code: string;
  message: string;
  output: string;
  ref: string;
  slug: string;
  workingCopy: string;
}> {
  const plugin = await requireLocalPlugin(localId);
  context.status(`Switching ${plugin.slug} to ${tagName}.`);
  try {
    const result = await switchReleaseTag(plugin.path, tagName, context, { conflictResolution });
    await removeStudioPluginCheckState(localId);
    return { ...result, slug: plugin.slug, checkState: null };
  } catch (error) {
    if (error instanceof ReleaseSwitchConflictError) {
      context.status("SVN switch needs a conflict resolution choice.");
      return {
        conflict: true,
        code: error.code,
        message: error.message,
        output: error.output,
        ref: error.ref,
        slug: plugin.slug,
        workingCopy: error.workingCopy
      };
    }
    throw error;
  }
}

async function buildReleaseBoard() {
  const plugins = await listLocalPlugins();
  const entries = await Promise.all(
    plugins.map(async (plugin) => {
      if (!plugin.exists || plugin.error) {
        return {
          id: plugin.id,
          name: plugin.name,
          slug: plugin.slug,
          path: plugin.path,
          exists: plugin.exists,
          error: plugin.error,
          statuses: ["unknown_svn_state"],
          releaseBlocked: false,
          messages: plugin.error ? [plugin.error] : []
        };
      }
      try {
        const versionState = await getVersionState(plugin.path);
        return {
          id: plugin.id,
          name: plugin.name,
          slug: plugin.slug,
          path: plugin.path,
          exists: plugin.exists,
          localVersion: versionState.localVersion,
          readmeStableTag: versionState.readmeStableTag,
          remoteVersion: versionState.remoteVersion,
          latestSvnTag: versionState.latestSvnTag,
          statuses: versionState.statuses,
          releaseBlocked: versionState.releaseBlocked,
          messages: versionState.messages
        };
      } catch (error) {
        return {
          id: plugin.id,
          name: plugin.name,
          slug: plugin.slug,
          path: plugin.path,
          exists: plugin.exists,
          error: error instanceof Error ? error.message : String(error),
          statuses: ["unknown_svn_state"],
          releaseBlocked: false,
          messages: [error instanceof Error ? error.message : String(error)]
        };
      }
    })
  );
  return { plugins: entries };
}

function sendReleaseError(response: ServerResponse, error: unknown): void {
  if (error instanceof ReleaseError) {
    sendJson(response, error.status, { error: { message: error.message, code: error.code } });
    return;
  }
  sendJson(response, 500, {
    error: { message: error instanceof Error ? error.message : String(error) }
  });
}

async function detectPublishRoute(
  inputDir: string,
  rootDir: string,
  slug: string,
  name: string,
  requestedAction: "auto" | "submit" | "release"
) {
  const { resolvePublishRoute } = await import("../wordpress-org/publish.js");
  if (requestedAction !== "auto") {
    return resolvePublishRoute({
      forceSubmit: requestedAction === "submit",
      forceRelease: requestedAction === "release"
    }) as { action: "submit" | "release"; reason: string };
  }

  const source = resolvePluginProjectPath(inputDir);
  const [pending, svnExists] = await Promise.all([
    hasSavedSession()
      .then((hasSession) =>
        hasSession
          ? fetchPluginStates()
              .then((states) => states.some((state) => matchesPluginState(state, slug) || matchesPluginState(state, name)))
              .catch(() => undefined)
          : undefined
      ),
    svnRepositoryExists(slug).catch(() => undefined)
  ]);
  const route = resolvePublishRoute({
    hasPendingSubmission: pending,
    svnRepositoryExists: svnExists,
    isLocalSvnWorkingCopy: Boolean(source.svnRootDir || resolvePluginProjectPath(rootDir).svnRootDir),
    canPrompt: false
  });

  if (route.action === "prompt") {
    throw new Error("Could not determine whether to submit or release. Choose Submit or Release explicitly.");
  }

  return route as { action: "submit" | "release"; reason: string };
}

async function requireLocalPlugin(id: string) {
  const plugin = await getLocalPlugin(id);
  if (!plugin) {
    throw new Error("Local plugin was not found.");
  }
  if (plugin.error) {
    throw new Error(plugin.error);
  }
  return plugin;
}

async function assertWebReleaseCredentials(slug: string): Promise<void> {
  const username = await inferWordPressOrgUsername();
  if (!username) {
    throw new Error("Could not infer a WordPress.org username. Log in with `pressship login` before releasing from Pressship Studio.");
  }
  if (!(await getSavedSvnPassword(username))) {
    throw new Error(
      `No saved WordPress.org SVN password found for ${username}. Generate one at ${getSvnPasswordUrl(
        username
      )}, then run a CLI release once or save credentials before releasing ${slug} from Pressship Studio.`
    );
  }
}

async function inferWordPressOrgUsername(): Promise<string | undefined> {
  return (await hasSavedSession()) ? (await getWordPressOrgAccount().then((account) => account.username).catch(() => undefined)) : undefined;
}

function createApproval(approvals: Map<string, Approval>, approval: Omit<Approval, "id" | "createdAt">): Approval {
  const id = createHash("sha256")
    .update(`${approval.localId}:${approval.action}:${approval.version}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 24);
  const value = { ...approval, id, createdAt: Date.now() };
  approvals.set(id, value);
  return value;
}

async function fetchHostedReadme(slug: string): Promise<string> {
  const response = await fetch(`https://plugins.svn.wordpress.org/${encodeURIComponent(slug)}/trunk/readme.txt`);
  if (!response.ok) {
    throw new Error(`Could not fetch readme.txt for ${slug}.`);
  }
  return response.text();
}

async function readTextFile(filePath: string): Promise<string> {
  return (await import("node:fs/promises")).readFile(filePath, "utf8");
}

class StudioAiChangeConflictError extends Error {}

type StudioAiChangeInput = z.infer<typeof studioAiChangeSchema>;

type StudioFileSnapshot = {
  size: number;
  mtimeMs: number;
  content: string;
};

type StudioFileChange = {
  path: string;
  status: "created" | "modified" | "deleted";
  beforeContent?: string;
  afterContent?: string;
  additions: number;
  deletions: number;
  hunks: StudioFileDiffHunk[];
};

type StudioFileDiffHunk = {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: StudioFileDiffLine[];
};

type StudioFileDiffLine = {
  type: "context" | "add" | "delete";
  content: string;
};

async function waitForChildProcess(
  child: ChildProcess,
  signal: AbortSignal
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      child.kill("SIGTERM");
      reject(new Error("AI assistance was cancelled."));
    };
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number | null, exitSignal: NodeJS.Signals | null) => {
      cleanup();
      resolve({ code, signal: exitSignal });
    };

    if (signal.aborted) {
      onAbort();
      return;
    }

    signal.addEventListener("abort", onAbort, { once: true });
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function createStudioAiPreviewWorkspace(pluginPath: string): Promise<{ root: string; path: string }> {
  const sourceRoot = path.resolve(pluginPath);
  const workspaceRoot = await mkdtemp(path.join(tmpdir(), "pressship-studio-ai-"));
  const workspacePath = path.join(workspaceRoot, path.basename(sourceRoot) || "plugin");
  const ignoredDirectories = new Set([
    ".git",
    ".svn",
    "node_modules",
    "vendor",
    "build",
    "dist",
    "playground",
    ".wordpress-playground",
    ".pressship-svn"
  ]);

  await cp(sourceRoot, workspacePath, {
    recursive: true,
    filter(sourcePath) {
      const relativePath = path.relative(sourceRoot, sourcePath);
      if (!relativePath) {
        return true;
      }
      return !relativePath.split(path.sep).some((part) => ignoredDirectories.has(part));
    }
  });

  return { root: workspaceRoot, path: workspacePath };
}

async function snapshotStudioFileContents(pluginPath: string): Promise<Map<string, StudioFileSnapshot>> {
  const root = path.resolve(pluginPath);
  const { files } = await listStudioFiles(root);
  const entries = await Promise.all(
    files.filter((file) => file.size <= maxStudioEditableFileBytes && isStudioEditablePath(file.path)).map(async (file) => {
      const filePath = path.join(root, file.path);
      const [fileStats, content] = await Promise.all([stat(filePath), readFile(filePath, "utf8")]);
      return [
        file.path,
        {
          size: fileStats.size,
          mtimeMs: fileStats.mtimeMs,
          content
        }
      ] as const;
    })
  );

  return new Map(entries);
}

function diffStudioFileContents(
  before: Map<string, StudioFileSnapshot>,
  after: Map<string, StudioFileSnapshot>
): StudioFileChange[] {
  const changes: StudioFileChange[] = [];
  for (const [filePath, afterValue] of after.entries()) {
    const beforeValue = before.get(filePath);
    if (!beforeValue) {
      changes.push(createStudioFileChange(filePath, "created", undefined, afterValue.content));
    } else if (beforeValue.content !== afterValue.content) {
      changes.push(createStudioFileChange(filePath, "modified", beforeValue.content, afterValue.content));
    }
  }

  for (const [filePath, beforeValue] of before.entries()) {
    if (!after.has(filePath)) {
      changes.push(createStudioFileChange(filePath, "deleted", beforeValue.content, undefined));
    }
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

function createStudioFileChange(
  filePath: string,
  status: StudioFileChange["status"],
  beforeContent: string | undefined,
  afterContent: string | undefined
): StudioFileChange {
  const hunks = createStudioFileDiffHunks(beforeContent ?? "", afterContent ?? "");
  return {
    path: filePath,
    status,
    beforeContent,
    afterContent,
    additions: countStudioFileDiffLines(hunks, "add"),
    deletions: countStudioFileDiffLines(hunks, "delete"),
    hunks
  };
}

function countStudioFileDiffLines(hunks: StudioFileDiffHunk[], type: "add" | "delete"): number {
  return hunks.reduce((count, hunk) => count + hunk.lines.filter((line) => line.type === type).length, 0);
}

function createStudioFileDiffHunks(beforeContent: string, afterContent: string): StudioFileDiffHunk[] {
  if (beforeContent === afterContent) {
    return [];
  }

  const beforeLines = splitStudioFileContentLines(beforeContent);
  const afterLines = splitStudioFileContentLines(afterContent);
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (beforeEnd >= prefix && afterEnd >= prefix && beforeLines[beforeEnd] === afterLines[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  const contextBeforeStart = Math.max(0, prefix - 3);
  const contextAfterBeforeEnd = Math.min(beforeLines.length - 1, beforeEnd + 3);
  const contextAfterAfterEnd = Math.min(afterLines.length - 1, afterEnd + 3);
  const leadingContext = beforeLines.slice(contextBeforeStart, prefix);
  const removed = beforeLines.slice(prefix, beforeEnd + 1);
  const added = afterLines.slice(prefix, afterEnd + 1);
  const trailingBefore = beforeLines.slice(beforeEnd + 1, contextAfterBeforeEnd + 1);
  const trailingAfter = afterLines.slice(afterEnd + 1, contextAfterAfterEnd + 1);
  const trailingContext = trailingBefore.length === trailingAfter.length ? trailingBefore : [];
  const lines: StudioFileDiffLine[] = [
    ...leadingContext.map((content) => ({ type: "context" as const, content })),
    ...removed.map((content) => ({ type: "delete" as const, content })),
    ...added.map((content) => ({ type: "add" as const, content })),
    ...trailingContext.map((content) => ({ type: "context" as const, content }))
  ];

  return [
    {
      oldStart: contextBeforeStart + 1,
      oldLines: leadingContext.length + removed.length + trailingContext.length,
      newStart: contextBeforeStart + 1,
      newLines: leadingContext.length + added.length + trailingContext.length,
      lines
    }
  ];
}

function splitStudioFileContentLines(content: string): string[] {
  if (!content) {
    return [];
  }
  return content.replace(/\r\n/g, "\n").split("\n");
}

function streamJobEvents(response: ServerResponse, jobs: WebJobManager, id: string): void {
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  const unsubscribe = jobs.subscribe(
    id,
    (event) => {
      response.write(`id: ${event.id}\n`);
      response.write(`event: ${event.type === "error" ? "job-error" : event.type}\n`);
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    () => response.end()
  );

  response.on("close", unsubscribe);
}

async function serveStatic(response: ServerResponse, staticDir: string, requestPath: string, token: string): Promise<void> {
  if (requestPath === "/" || isSpaRoutePath(requestPath)) {
    await serveIndex(response, staticDir, token);
    return;
  }

  const rootDir = path.resolve(staticDir);
  const relativePath = requestPath.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, relativePath);
  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    sendJson(response, 403, { error: { message: "Forbidden." } });
    return;
  }

  if (path.basename(filePath) === "index.html") {
    await serveIndex(response, rootDir, token);
    return;
  }

  try {
    await stat(filePath);
  } catch {
    sendJson(response, 404, { error: { message: "Not found." } });
    return;
  }

  const type = contentType(filePath);
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": type
  });
  createReadStream(filePath)
    .on("error", () => sendJson(response, 404, { error: { message: "Not found." } }))
    .pipe(response);
}

function isSpaRoutePath(requestPath: string): boolean {
  const firstSegment = requestPath.split("/").filter(Boolean)[0] ?? "";
  return spaRoutePrefixes.has(firstSegment);
}

async function serveIndex(response: ServerResponse, staticDir: string, token: string): Promise<void> {
  const filePath = path.join(staticDir, "index.html");
  const html = await readFile(filePath, "utf8");
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html.replace("__PRESSSHIP_TOKEN__", token));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body, null, 2));
}

function resolveStaticDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "../../assets/web");
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  return "application/octet-stream";
}
