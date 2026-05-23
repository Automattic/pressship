import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { execa } from "execa";
import fg from "fast-glob";
import { z } from "zod";
import { hasSavedSession } from "../auth/session.js";
import { getWordPressOrgAccount } from "../auth/whoami.js";
import { createPluginPack, summarizePackResult, validatePluginPack } from "../package/pack.js";
import { discoverPluginProject, resolvePluginProjectPath } from "../plugin/discover.js";
import { createDemoLaunchPlan } from "../plugin/demo.js";
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
import { ensureCacheDir, getConfigDir } from "../utils/paths.js";
import { addLocalPluginPath, getLocalPlugin, listLocalPlugins, removeLocalPlugin } from "./registry.js";
import { WebJobManager, type WebJobContext } from "./jobs.js";
import { getVersionState } from "./version-state.js";
import { resolveFreePort } from "./ports.js";
import { readWebSettings, webSettingsSchema, writeWebSettings } from "./settings.js";
import {
  addStudioPluginCheckLineHints,
  normalizeStudioPluginCheckFindings,
  summarizeStudioPluginCheckFindings
} from "./plugin-check.js";

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const addLocalPluginSchema = z.object({ path: z.string().min(1) });
const bumpVersionSchema = z.object({ bump: z.enum(["patch", "minor", "major"]) });
const writeStudioFileSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});
const jobSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("clone"),
    slug: z.string().min(1),
    destination: z.string().optional()
  }),
  z.object({
    type: z.literal("play"),
    scope: z.enum(["remote", "local"]),
    id: z.string().min(1)
  }),
  z.object({
    type: z.literal("check"),
    localId: z.string().min(1)
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
  })
]);

export type WebServerOptions = {
  host?: string;
  port?: string | number;
  noOpen?: boolean;
};

type Approval = {
  id: string;
  localId: string;
  pluginPath: string;
  action: "submit" | "release";
  version?: string;
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
  const staticDir = resolveStaticDir();
  const server = createServer((request, response) => {
    void handleRequest(request, response, { token, jobs, approvals, playgrounds, staticDir });
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
  });

  return {
    server,
    url,
    token,
    jobs,
    close: async () => {
      jobs.cancelRunningJobs();
      stopPlaygrounds(playgrounds);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: {
    token: string;
    jobs: WebJobManager;
    approvals: Map<string, Approval>;
    playgrounds: Map<string, ManagedPlayground>;
    staticDir: string;
  }
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

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: {
    token: string;
    jobs: WebJobManager;
    approvals: Map<string, Approval>;
    playgrounds: Map<string, ManagedPlayground>;
    staticDir: string;
  }
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
    sendJson(response, 200, { removed: await removeLocalPlugin(decodeURIComponent(deleteLocalMatch[1])) });
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

  const studioFileContentMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/files\/content$/);
  if (method === "GET" && studioFileContentMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioFileContentMatch[1]));
    const relativePath = url.searchParams.get("path") ?? "";
    sendJson(response, 200, await readStudioFile(plugin.path, relativePath));
    return;
  }

  if (method === "PUT" && studioFileContentMatch) {
    const plugin = await requireLocalPlugin(decodeURIComponent(studioFileContentMatch[1]));
    const body = writeStudioFileSchema.parse(await readJson(request));
    sendJson(response, 200, await writeStudioFile(plugin.path, body.path, body.content));
    return;
  }

  const bumpMatch = url.pathname.match(/^\/api\/plugins\/local\/([^/]+)\/bump-version$/);
  if (method === "POST" && bumpMatch) {
    const body = bumpVersionSchema.parse(await readJson(request));
    const plugin = await requireLocalPlugin(decodeURIComponent(bumpMatch[1]));
    await bumpLocalPluginVersion(plugin.path, body.bump);
    await addLocalPluginPath(plugin.path, plugin.source);
    sendJson(response, 200, await getVersionState(plugin.path));
    return;
  }

  if (method === "POST" && url.pathname === "/api/jobs") {
    const body = jobSchema.parse(await readJson(request));
    const job = createWebJob(body, context.jobs, context.approvals, context.playgrounds);
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
  playgrounds: Map<string, ManagedPlayground>
) {
  if (input.type === "clone") {
    return jobs.create("clone", `Clone/update ${input.slug}`, (context) => clonePluginJob(input, context));
  }

  if (input.type === "play") {
    return jobs.create("play", `Start Playground for ${input.id}`, (context) => playPluginJob(input, playgrounds, context));
  }

  if (input.type === "check") {
    return jobs.create("check", "Plugin Check", (context) => pluginCheckJob(input.localId, context));
  }

  if (input.type === "dry-run-publish") {
    return jobs.create("dry-run-publish", "Dry-run publish", (context) =>
      dryRunPublishJob(input.localId, input.action, approvals, context)
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
  context: WebJobContext
) {
  const target = input.scope === "local" ? (await requireLocalPlugin(input.id)).path : input.id;
  const settings = await readWebSettings();
  const port = await resolveFreePort("127.0.0.1", settings.playgroundPortStart, false, settings.playgroundPortEnd);
  const plan = await createDemoLaunchPlan(target, { port: String(port), skipBrowser: true, reset: false });
  if (!plan.url) {
    throw new Error("Could not determine Playground URL.");
  }

  context.status(`Starting Playground for ${plan.name} on ${plan.url}`);
  const child = spawn(plan.command, plan.args, { cwd: plan.cwd, stdio: ["ignore", "pipe", "pipe"] });
  context.registerCancel(() => child.kill("SIGTERM"));
  child.stdout.on("data", (chunk) => context.log(chunk.toString()));
  child.stderr.on("data", (chunk) => context.log(chunk.toString()));

  let removeStartupListeners = () => {};
  const exitBeforeReady = new Promise<never>((_resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      reject(new Error(`Playground exited before it was ready (${signal ?? code ?? "unknown"}).`));
    };
    child.once("error", onError);
    child.once("exit", onExit);
    removeStartupListeners = () => {
      child.off("error", onError);
      child.off("exit", onExit);
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
    pid: child.pid,
    child
  };
  playgrounds.set(instance.id, instance);
  child.once("exit", () => {
    playgrounds.delete(instance.id);
  });

  context.status(`Playground is ready at ${plan.url}`);
  return {
    url: plan.url,
    urls: playgroundUrls(plan.url),
    credentials: {
      username: "admin",
      password: "password"
    },
    playground: publicPlayground(instance),
    plan
  };
}

async function pluginCheckJob(localId: string, context: WebJobContext) {
  const local = await requireLocalPlugin(localId);
  const source = resolvePluginProjectPath(local.path);
  const project = await discoverPluginProject(source.rootDir);

  context.status(`Running WordPress.org Plugin Check for ${project.headers.pluginName}.`);
  const result = await runPluginCheck(source.rootDir, { mode: "new" });
  const findings = await addStudioPluginCheckLineHints(
    normalizeStudioPluginCheckFindings(result.findings, source.rootDir, project.slug),
    source.rootDir
  );
  const summary = summarizeStudioPluginCheckFindings(findings);
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
    rawOutput: result.rawOutput
  };
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

  context.status("Validating package.");
  const validation = await validatePluginPack(project, {});
  const validationBlocked = hasBlockingFindings(validation.readmeFindings) || hasBlockingFindings(validation.pluginCheckFindings);
  const cacheDir = path.join(await ensureCacheDir(), "studio-packages");
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const pack = summarizePackResult(await createPluginPack(source.rootDir, { outputDir: cacheDir }), validation);
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
        version: project.version
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

async function listStudioFiles(pluginPath: string) {
  const root = path.resolve(pluginPath);
  const files = await fg(
    [
      "**/*.{php,js,jsx,ts,tsx,css,scss,sass,html,htm,json,md,txt,xml,yml,yaml,po,pot,ini,sh}",
      "composer.json",
      "package.json",
      "readme.txt"
    ],
    {
      cwd: root,
      onlyFiles: true,
      dot: false,
      unique: true,
      ignore: [
        "**/.git/**",
        "**/.svn/**",
        "**/node_modules/**",
        "**/vendor/**",
        "**/build/**",
        "**/dist/**",
        "**/playground/**",
        "**/.wordpress-playground/**"
      ]
    }
  );

  const entries = await Promise.all(
    files.sort((a, b) => a.localeCompare(b)).map(async (relativePath) => {
      const fileStats = await stat(path.join(root, relativePath));
      return {
        path: relativePath,
        name: path.basename(relativePath),
        directory: path.dirname(relativePath) === "." ? "" : path.dirname(relativePath),
        size: fileStats.size
      };
    })
  );

  return { files: entries.filter((entry) => entry.size <= 1_000_000) };
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

  return filePath;
}

function normalizeStudioRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter(Boolean).join("/");
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
  const filePath = path.join(staticDir, requestPath === "/" ? "index.html" : requestPath);
  if (!filePath.startsWith(staticDir)) {
    sendJson(response, 403, { error: { message: "Forbidden." } });
    return;
  }

  if (path.basename(filePath) === "index.html") {
    const html = (await import("node:fs/promises")).readFile(filePath, "utf8");
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end((await html).replace("__PRESSSHIP_TOKEN__", token));
    return;
  }

  const type = contentType(filePath);
  response.writeHead(200, { "Content-Type": type });
  createReadStream(filePath)
    .on("error", () => sendJson(response, 404, { error: { message: "Not found." } }))
    .pipe(response);
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
