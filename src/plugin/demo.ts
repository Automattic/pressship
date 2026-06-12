import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { z } from "zod";
import { discoverPluginProject } from "./discover.js";
import { fetchHostedPluginInfo, slugFromHostedTarget } from "./info.js";
import type { PluginProject } from "../types.js";
import { ui } from "../ui.js";
import { ensureCacheDir, pathExists } from "../utils/paths.js";

const playgroundCliPackage = "@wp-playground/cli@latest";
const compatibilityMuPluginPath = "/wordpress/wp-content/mu-plugins/pressship-playground-compat.php";
const defaultMysqlDatabasePrefix = "pressship_playground";
const managedMysqlContainerName = "pressship-playground-mariadb";
const managedMysqlImage = "mariadb:10.6";
const managedMysqlPassword = "pressship";
const compatibilityMuPlugin = `<?php
$pressship_deprecated_mask = (defined('E_DEPRECATED') ? E_DEPRECATED : 0) | (defined('E_USER_DEPRECATED') ? E_USER_DEPRECATED : 0);
if ($pressship_deprecated_mask) {
    error_reporting(error_reporting() & ~$pressship_deprecated_mask);
}

function pressship_silence_deprecated_errors($severity) {
    $deprecated_mask = (defined('E_DEPRECATED') ? E_DEPRECATED : 0) | (defined('E_USER_DEPRECATED') ? E_USER_DEPRECATED : 0);
    return $deprecated_mask && (($severity & $deprecated_mask) !== 0);
}

set_error_handler('pressship_silence_deprecated_errors');

if (! function_exists('is_plugin_active')) {
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
}

function pressship_remove_frame_options_header() {
    remove_action('admin_init', 'send_frame_options_header');
    remove_action('login_init', 'send_frame_options_header');
    if (function_exists('header_remove')) {
        header_remove('X-Frame-Options');
    }
}

pressship_remove_frame_options_header();

function pressship_filter_playground_headers($headers) {
    unset($headers['X-Frame-Options']);
    unset($headers['x-frame-options']);
    return $headers;
}

add_filter('wp_headers', 'pressship_filter_playground_headers');

add_action('init', 'pressship_remove_frame_options_header', 0);
add_action('admin_init', 'pressship_remove_frame_options_header', 0);
add_action('admin_init', 'pressship_remove_frame_options_header', PHP_INT_MAX);
add_action('login_init', 'pressship_remove_frame_options_header', 0);
add_action('login_init', 'pressship_remove_frame_options_header', PHP_INT_MAX);
add_action('send_headers', 'pressship_remove_frame_options_header', PHP_INT_MAX);

function pressship_ensure_playground_admin() {
    if (! username_exists('admin')) {
        $user_id = wp_create_user('admin', 'password', 'admin@example.test');
        if (! is_wp_error($user_id)) {
            $user = new WP_User($user_id);
            $user->set_role('administrator');
        }
    }

    if (! is_admin() || is_user_logged_in() || ! isset($_GET['pressship_auto_login'])) {
        return;
    }

    $user = get_user_by('login', 'admin');
    if (! $user) {
        return;
    }

    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID);
    wp_safe_redirect(remove_query_arg('pressship_auto_login'));
    exit;
}

add_action('init', 'pressship_ensure_playground_admin');
`;

const playgroundDatabaseModeSchema = z.enum(["auto", "sqlite", "mysql"]);

const demoOptionsSchema = z.object({
  port: z.string().optional(),
  wp: z.string().optional(),
  php: z.string().optional(),
  database: playgroundDatabaseModeSchema.default("auto"),
  mysqlHost: z.string().trim().min(1).default("127.0.0.1"),
  mysqlPort: z.coerce.number().int().min(1).max(65535).default(3306),
  mysqlUser: z.string().trim().min(1).default("root"),
  mysqlPassword: z.string().default(""),
  mysqlDatabasePrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]+$/, "MySQL database prefix can only contain letters, numbers, and underscores.")
    .min(1)
    .max(40)
    .default(defaultMysqlDatabasePrefix),
  reset: z.boolean().default(false),
  skipBrowser: z.boolean().default(false)
});

export type DemoOptions = z.input<typeof demoOptionsSchema>;
type ResolvedDemoOptions = z.infer<typeof demoOptionsSchema>;
export type PlaygroundDatabaseMode = z.infer<typeof playgroundDatabaseModeSchema>;

export type PlaygroundDatabasePlan =
  | {
      mode: "sqlite";
    }
  | {
      mode: "mysql";
      host: string;
      port: number;
      user: string;
      password: string;
      database: string;
      configPath: string;
      sqliteBypassDir: string;
      server: "external" | "managed-docker";
    };

export type PublicPlaygroundDatabasePlan =
  | {
      mode: "sqlite";
    }
  | {
      mode: "mysql";
      host: string;
      port: number;
      user: string;
      database: string;
      server: "external" | "managed-docker";
    };

export type PlaygroundBlueprint = {
  landingPage: string;
  steps: Array<Record<string, unknown>>;
};

export type DemoLaunchPlan = {
  source: "local" | "wordpress.org";
  name: string;
  slug: string;
  command: string;
  args: string[];
  cwd: string;
  blueprintPath: string;
  siteDir: string;
  database: PlaygroundDatabasePlan;
  wpVersion?: string;
  phpVersion?: string;
  url?: string;
};

export type PublicDemoLaunchPlan = Omit<DemoLaunchPlan, "database"> & {
  database: PublicPlaygroundDatabasePlan;
};

export class PlaygroundRuntimeUnsupportedError extends Error {
  constructor(
    message: string,
    readonly details: { wpVersion?: string; phpVersion?: string }
  ) {
    super(message);
    this.name = "PlaygroundRuntimeUnsupportedError";
  }
}

export async function demo(target: string | undefined, rawOptions: DemoOptions = {}): Promise<void> {
  const options = demoOptionsSchema.parse(rawOptions);
  ui.intro("Start plugin demo");

  const plan = await ui.task("Preparing Playground demo", () => createDemoLaunchPlan(target, options), (value) =>
    `Prepared ${value.name}`
  );

  ui.section("Playground");
  ui.keyValue("Plugin", plan.name);
  ui.keyValue("Source", plan.source);
  ui.keyValue("Slug", plan.slug);
  ui.keyValue("WordPress", plan.wpVersion ?? "default");
  ui.keyValue("PHP", plan.phpVersion ?? "default");
  ui.keyValue("Database", describePlaygroundDatabase(plan.database));
  ui.keyValue("Site", ui.path(plan.siteDir));
  if (plan.url) {
    ui.keyValue("URL", ui.path(plan.url));
  }
  ui.keyValue("Blueprint", ui.path(plan.blueprintPath));

  if (options.reset) {
    await ui.task("Resetting persisted Playground site", () => resetPlaygroundSite(plan.siteDir), () => "Reset complete");
  }

  assertDemoLaunchPlanSupported(plan);
  await prepareDemoRuntime(plan, { resetDatabase: options.reset });

  ui.info("Starting WordPress Playground. Press Ctrl+C to stop the local server.");

  await execa(plan.command, plan.args, {
    cwd: plan.cwd,
    stdio: "inherit"
  });
}

export async function createDemoLaunchPlan(
  target: string | undefined,
  rawOptions: DemoOptions
): Promise<DemoLaunchPlan> {
  const options = demoOptionsSchema.parse(rawOptions);
  const resolvedTarget = target ?? process.cwd();

  if (isLocalPluginTarget(resolvedTarget)) {
    const project = await discoverPluginProject(resolvedTarget);
    const playgroundOptions = resolveDemoPlaygroundOptions(options, {
      wp: project.headers.requiresAtLeast ?? project.readme?.requiresAtLeast,
      php: project.headers.requiresPhp ?? project.readme?.requiresPhp
    });
    const databaseMode = resolvePlaygroundDatabaseMode(playgroundOptions);
    const playgroundCwd = await createPlaygroundRuntimeCwd(project.rootDir, project.slug, playgroundOptions, databaseMode);
    const blueprintPath = await writeDemoBlueprint(project.slug, createLocalDemoBlueprint(project));
    const url = options.port ? `http://127.0.0.1:${options.port}` : undefined;
    const database = await createPlaygroundDatabasePlan({
      mode: databaseMode,
      runtimeCwd: playgroundCwd,
      siteDir: getPlaygroundSiteDirForRuntime(playgroundCwd, databaseMode),
      slug: project.slug,
      sourcePath: project.rootDir,
      options: playgroundOptions
    });
    const args =
      database.mode === "mysql"
        ? createPlaygroundServerArgs({
            blueprintPath,
            mount: `${project.rootDir}:/wordpress/wp-content/plugins/${project.slug}`,
            database,
            options: playgroundOptions
          })
        : createPlaygroundStartArgs({
            path: project.rootDir,
            blueprintPath,
            mount: `${project.rootDir}:/wordpress/wp-content/plugins/${project.slug}`,
            options: playgroundOptions
          });

    return {
      source: "local",
      name: project.headers.pluginName,
      slug: project.slug,
      command: "npx",
      args,
      cwd: playgroundCwd,
      blueprintPath,
      siteDir: getPlaygroundSiteDirForRuntime(playgroundCwd, databaseMode),
      database,
      wpVersion: playgroundOptions.wp,
      phpVersion: playgroundOptions.php,
      url
    };
  }

  const slug = slugFromHostedTarget(resolvedTarget);
  const plugin = await fetchHostedPluginInfo(slug);
  const playgroundOptions = resolveDemoPlaygroundOptions(options, {
    wp: plugin.requires,
    php: plugin.requiresPhp
  });
  const blueprintPath = await writeDemoBlueprint(slug, createHostedDemoBlueprint(slug));
  const demoDir = path.dirname(blueprintPath);
  const databaseMode = resolvePlaygroundDatabaseMode(playgroundOptions);
  const playgroundCwd = await createPlaygroundRuntimeCwd(demoDir, slug, playgroundOptions, databaseMode);
  const url = options.port ? `http://127.0.0.1:${options.port}` : undefined;
  const database = await createPlaygroundDatabasePlan({
    mode: databaseMode,
    runtimeCwd: playgroundCwd,
    siteDir: getPlaygroundSiteDirForRuntime(playgroundCwd, databaseMode),
    slug,
    sourcePath: demoDir,
    options: playgroundOptions
  });
  const args =
    database.mode === "mysql"
      ? createPlaygroundServerArgs({
          blueprintPath,
          database,
          options: playgroundOptions
        })
      : createPlaygroundStartArgs({
          path: demoDir,
          blueprintPath,
          options: playgroundOptions
        });

  return {
    source: "wordpress.org",
    name: plugin.name,
    slug,
    command: "npx",
    args,
    cwd: playgroundCwd,
    blueprintPath,
    siteDir: getPlaygroundSiteDirForRuntime(playgroundCwd, databaseMode),
    database,
    wpVersion: playgroundOptions.wp,
    phpVersion: playgroundOptions.php,
    url
  };
}

export function createLocalDemoBlueprint(project: PluginProject): PlaygroundBlueprint {
  const relativeMainFile = path.relative(project.rootDir, project.mainFile).split(path.sep).join("/");

  return {
    landingPage: "/wp-admin/plugins.php",
    steps: [
      ...createPlaygroundCompatibilitySteps(),
      {
        step: "activatePlugin",
        pluginName: project.headers.pluginName,
        pluginPath: `/wordpress/wp-content/plugins/${project.slug}/${relativeMainFile}`
      }
    ]
  };
}

export function createHostedDemoBlueprint(slug: string): PlaygroundBlueprint {
  return {
    landingPage: "/wp-admin/plugins.php",
    steps: [
      ...createPlaygroundCompatibilitySteps(),
      {
        step: "installPlugin",
        pluginData: {
          resource: "wordpress.org/plugins",
          slug
        },
        options: {
          activate: true
        }
      }
    ]
  };
}

export function createPlaygroundCompatibilitySteps(): Array<Record<string, unknown>> {
  return [
    {
      step: "mkdir",
      path: "/wordpress/wp-content/mu-plugins"
    },
    {
      step: "writeFile",
      path: compatibilityMuPluginPath,
      data: compatibilityMuPlugin
    }
  ];
}

export function createPlaygroundStartArgs(input: {
  path: string;
  blueprintPath: string;
  mount?: string;
  options: DemoOptions;
}): string[] {
  const options = demoOptionsSchema.parse(input.options);
  return [
    "--yes",
    playgroundCliPackage,
    "start",
    `--path=${input.path}`,
    `--blueprint=${input.blueprintPath}`,
    "--define-bool",
    "WP_DEBUG",
    "false",
    "--define-bool",
    "WP_DEBUG_DISPLAY",
    "false",
    ...(input.mount ? ["--no-auto-mount", `--mount=${input.mount}`] : []),
    ...(options.port ? [`--port=${options.port}`] : []),
    ...(options.wp ? [`--wp=${options.wp}`] : []),
    ...(options.php ? [`--php=${options.php}`] : []),
    ...(options.skipBrowser ? ["--skip-browser"] : [])
  ];
}

export function createPlaygroundServerArgs(input: {
  blueprintPath: string;
  mount?: string;
  database: Extract<PlaygroundDatabasePlan, { mode: "mysql" }>;
  options: DemoOptions;
}): string[] {
  const options = demoOptionsSchema.parse(input.options);
  const siteUrl = options.port ? `http://127.0.0.1:${options.port}` : undefined;
  return [
    "--yes",
    playgroundCliPackage,
    "server",
    `--mount-before-install=${input.database.configPath}:/wordpress/wp-config.php`,
    `--mount-before-install=${input.database.sqliteBypassDir}:/wordpress/wp-content/mu-plugins/sqlite-database-integration`,
    "--skip-sqlite-setup",
    `--blueprint=${input.blueprintPath}`,
    ...(input.mount ? [`--mount=${input.mount}`] : []),
    ...(options.port ? [`--port=${options.port}`] : []),
    ...(siteUrl ? [`--site-url=${siteUrl}`] : []),
    ...(options.wp ? [`--wp=${options.wp}`] : []),
    ...(options.php ? [`--php=${options.php}`] : [])
  ];
}

export function resolveDemoPlaygroundOptions(
  rawOptions: DemoOptions,
  _requiredVersions: { wp?: unknown; php?: unknown }
): ResolvedDemoOptions {
  const options = demoOptionsSchema.parse(rawOptions);
  const wp = normalizePlaygroundVersion(options.wp);
  const explicitPhp = normalizePlaygroundVersion(options.php);
  return {
    ...options,
    wp,
    php: explicitPhp ?? inferPlaygroundPhpVersionForWordPress(wp)
  };
}

export function resolvePlaygroundDatabaseMode(options: Pick<ResolvedDemoOptions, "database" | "wp">): "sqlite" | "mysql" {
  if (options.database === "mysql") {
    return "mysql";
  }
  if (options.database === "sqlite") {
    return "sqlite";
  }

  const branch = parseWordPressBranch(options.wp);
  return branch && !isWordPressBranchAtLeast(branch, 4, 7) ? "mysql" : "sqlite";
}

export async function prepareDemoRuntime(
  plan: DemoLaunchPlan,
  options: { resetDatabase?: boolean } = {}
): Promise<void> {
  if (plan.database.mode !== "mysql") {
    return;
  }

  await mkdir(plan.siteDir, { recursive: true, mode: 0o700 });
  await mkdir(plan.database.sqliteBypassDir, { recursive: true, mode: 0o700 });
  await writeFile(plan.database.configPath, createMysqlWpConfig(plan.database), { mode: 0o600 });
  await prepareMysqlDatabase(plan.database, { reset: options.resetDatabase ?? false });
}

export function publicDemoLaunchPlan(plan: DemoLaunchPlan): PublicDemoLaunchPlan {
  if (plan.database.mode === "sqlite") {
    return { ...plan, database: { mode: "sqlite" } };
  }

  const { host, port, user, database, server } = plan.database;
  return {
    ...plan,
    database: {
      mode: "mysql",
      host,
      port,
      user,
      database,
      server
    }
  };
}

export function inferPlaygroundPhpVersionForWordPress(wpVersion: string | undefined): string | undefined {
  const branch = parseWordPressBranch(wpVersion);
  if (!branch) {
    return undefined;
  }

  if (isWordPressBranchAtLeast(branch, 6, 9)) return "8.5";
  if (isWordPressBranchAtLeast(branch, 6, 7)) return "8.4";
  if (isWordPressBranchAtLeast(branch, 6, 4)) return "8.3";
  if (isWordPressBranchAtLeast(branch, 6, 1)) return "8.2";
  if (isWordPressBranchAtLeast(branch, 5, 9)) return "8.1";
  if (isWordPressBranchAtLeast(branch, 5, 6)) return "8.0";
  if (isWordPressBranchAtLeast(branch, 4, 7)) return "7.4";
  return "5.2";
}

export function getPlaygroundRuntimeLimitation(wpVersion: string | undefined): string | undefined {
  const branch = parseWordPressBranch(wpVersion);
  if (!branch || isWordPressBranchAtLeast(branch, 4, 7)) {
    return undefined;
  }

  return (
    `WordPress Playground cannot currently run WordPress ${wpVersion} with its matching legacy PHP runtime. ` +
    "The PHP 5.2 runtime cannot parse the current SQLite integration, and the MySQL path needs the old PHP mysql extension that Playground does not provide. " +
    "Use Latest or WordPress 4.7+ in Playground, or test this version in a local PHP/MySQL environment outside Playground."
  );
}

export function assertDemoLaunchPlanSupported(plan: Pick<DemoLaunchPlan, "wpVersion" | "phpVersion">): void {
  const limitation = getPlaygroundRuntimeLimitation(plan.wpVersion);
  if (limitation) {
    throw new PlaygroundRuntimeUnsupportedError(limitation, {
      wpVersion: plan.wpVersion,
      phpVersion: plan.phpVersion
    });
  }
}

export function getPlaygroundSiteDir(projectPath: string): string {
  const siteId = createHash("sha256").update(projectPath).digest("hex");
  return path.join(homedir(), ".wordpress-playground", "sites", siteId);
}

export async function resetPlaygroundSite(siteDir: string): Promise<void> {
  await rm(siteDir, { recursive: true, force: true });
}

async function writeDemoBlueprint(slug: string, blueprint: PlaygroundBlueprint): Promise<string> {
  const cacheDir = await ensureCacheDir();
  const demoDir = path.join(cacheDir, "demo", slug);
  const blueprintPath = path.join(demoDir, "blueprint.json");

  await mkdir(demoDir, { recursive: true, mode: 0o700 });
  await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);

  return blueprintPath;
}

async function createPlaygroundRuntimeCwd(
  sourcePath: string,
  slug: string,
  options: ResolvedDemoOptions,
  databaseMode: "sqlite" | "mysql"
): Promise<string> {
  const cacheDir = await ensureCacheDir();
  const runtimeId = createHash("sha256")
    .update(`${sourcePath}\0wp=${options.wp ?? "latest"}\0php=${options.php ?? "latest"}\0db=${databaseMode}`)
    .digest("hex");
  const runtimeCwd = path.join(cacheDir, "playground-runtime", slug, runtimeId);
  await mkdir(runtimeCwd, { recursive: true, mode: 0o700 });
  return runtimeCwd;
}

function getPlaygroundSiteDirForRuntime(runtimeCwd: string, databaseMode: "sqlite" | "mysql"): string {
  return databaseMode === "mysql" ? path.join(runtimeCwd, "wordpress") : getPlaygroundSiteDir(runtimeCwd);
}

async function createPlaygroundDatabasePlan(input: {
  mode: "sqlite" | "mysql";
  runtimeCwd: string;
  siteDir: string;
  slug: string;
  sourcePath: string;
  options: ResolvedDemoOptions;
}): Promise<PlaygroundDatabasePlan> {
  if (input.mode === "sqlite") {
    return { mode: "sqlite" };
  }

  const database = createPlaygroundMysqlDatabaseName(
    input.options.mysqlDatabasePrefix,
    input.slug,
    `${input.sourcePath}\0wp=${input.options.wp ?? "latest"}\0php=${input.options.php ?? "latest"}`
  );
  const configPath = path.join(input.siteDir, "wp-config.mysql.php");
  const sqliteBypassDir = path.join(input.siteDir, "sqlite-database-integration");
  const plan = {
    mode: "mysql" as const,
    host: input.options.mysqlHost,
    port: input.options.mysqlPort,
    user: input.options.mysqlUser,
    password: input.options.mysqlPassword,
    database,
    configPath,
    sqliteBypassDir,
    server: "external" as const
  };

  return plan;
}

function createPlaygroundMysqlDatabaseName(prefix: string, slug: string, key: string): string {
  const safePrefix = sanitizeMysqlIdentifier(prefix) || defaultMysqlDatabasePrefix;
  const safeSlug = sanitizeMysqlIdentifier(slug) || "plugin";
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 10);
  const maxSlugLength = Math.max(1, 64 - safePrefix.length - hash.length - 2);
  return `${safePrefix}_${safeSlug.slice(0, maxSlugLength)}_${hash}`.slice(0, 64);
}

function sanitizeMysqlIdentifier(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
}

function createMysqlWpConfig(database: Extract<PlaygroundDatabasePlan, { mode: "mysql" }>): string {
  const dbHost = database.port === 3306 ? database.host : `${database.host}:${database.port}`;
  const salts = [
    "AUTH_KEY",
    "SECURE_AUTH_KEY",
    "LOGGED_IN_KEY",
    "NONCE_KEY",
    "AUTH_SALT",
    "SECURE_AUTH_SALT",
    "LOGGED_IN_SALT",
    "NONCE_SALT"
  ]
    .map((name) => `define(${phpString(name)}, ${phpString(randomSalt())});`)
    .join("\n");

  return `<?php
define('DB_NAME', ${phpString(database.database)});
define('DB_USER', ${phpString(database.user)});
define('DB_PASSWORD', ${phpString(database.password)});
define('DB_HOST', ${phpString(dbHost)});
define('DB_CHARSET', 'utf8');
define('DB_COLLATE', '');
define('WP_DEBUG', false);
define('WP_DEBUG_DISPLAY', false);
${salts}

$table_prefix = 'wp_';

if ( ! defined('ABSPATH') ) {
    define('ABSPATH', dirname(__FILE__) . '/');
}

require_once ABSPATH . 'wp-settings.php';
`;
}

async function prepareMysqlDatabase(
  database: Extract<PlaygroundDatabasePlan, { mode: "mysql" }>,
  options: { reset: boolean }
): Promise<void> {
  if (process.env.PRESSSHIP_TEST_SKIP_MYSQL_PREP === "1") {
    return;
  }

  try {
    await createMysqlDatabase(database, options);
  } catch (error) {
    if (shouldUseManagedMysqlFallback(database, error)) {
      await configureManagedMysql(database);
      await writeFile(database.configPath, createMysqlWpConfig(database), { mode: 0o600 });
      await createMysqlDatabase(database, options);
      return;
    }

    throw createMysqlPrepareError(database, error);
  }
}

async function createMysqlDatabase(
  database: Extract<PlaygroundDatabasePlan, { mode: "mysql" }>,
  options: { reset: boolean }
): Promise<void> {
  const databaseName = escapeMysqlIdentifier(database.database);
  const sql = options.reset
    ? `DROP DATABASE IF EXISTS ${databaseName};\nCREATE DATABASE ${databaseName} CHARACTER SET utf8 COLLATE utf8_general_ci;\n`
    : `CREATE DATABASE IF NOT EXISTS ${databaseName} CHARACTER SET utf8 COLLATE utf8_general_ci;\n`;
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: database.host,
    port: database.port,
    user: database.user,
    password: database.password,
    multipleStatements: true
  });

  try {
    await connection.query(sql);
  } finally {
    await connection.end().catch(() => undefined);
  }
}

async function configureManagedMysql(database: Extract<PlaygroundDatabasePlan, { mode: "mysql" }>): Promise<void> {
  try {
    const port = await ensureManagedMysqlContainer();
    database.host = "127.0.0.1";
    database.port = port;
    database.user = "root";
    database.password = managedMysqlPassword;
    database.server = "managed-docker";
  } catch (error) {
    throw new Error(
      `No MySQL server is reachable at ${database.host}:${database.port}, and Pressship could not start its managed MariaDB container. ` +
        `Start Docker or OrbStack, or configure an external MySQL server in Settings. ${errorMessage(error)}`
    );
  }
}

async function ensureManagedMysqlContainer(): Promise<number> {
  const existing = await inspectManagedMysqlContainer();
  if (existing) {
    if (!existing.running) {
      await execa("docker", ["start", managedMysqlContainerName]);
    }
    await waitForManagedMysql(existing.port);
    return existing.port;
  }

  const port = await getFreeLocalPort();
  await execa("docker", [
    "run",
    "-d",
    "--name",
    managedMysqlContainerName,
    "-p",
    `127.0.0.1:${port}:3306`,
    "-e",
    `MARIADB_ROOT_PASSWORD=${managedMysqlPassword}`,
    "-e",
    "MARIADB_AUTO_UPGRADE=1",
    "-e",
    "MARIADB_INITDB_SKIP_TZINFO=1",
    managedMysqlImage
  ]);
  await waitForManagedMysql(port);
  return port;
}

async function inspectManagedMysqlContainer(): Promise<{ running: boolean; port: number } | undefined> {
  const result = await execa("docker", ["container", "inspect", managedMysqlContainerName], { reject: false });
  if (result.exitCode !== 0) {
    return undefined;
  }

  const inspected = JSON.parse(result.stdout) as Array<{
    State?: { Running?: boolean };
    NetworkSettings?: { Ports?: Record<string, Array<{ HostPort?: string }> | null> };
  }>;
  const container = inspected[0];
  const hostPort = container?.NetworkSettings?.Ports?.["3306/tcp"]?.[0]?.HostPort;
  const port = Number(hostPort);
  if (!Number.isInteger(port) || port <= 0) {
    await execa("docker", ["rm", "-f", managedMysqlContainerName], { reject: false });
    return undefined;
  }

  return {
    running: Boolean(container?.State?.Running),
    port
  };
}

async function waitForManagedMysql(port: number): Promise<void> {
  const started = Date.now();
  let lastError: unknown;
  while (Date.now() - started < 90_000) {
    try {
      const mysql = await import("mysql2/promise");
      const connection = await mysql.createConnection({
        host: "127.0.0.1",
        port,
        user: "root",
        password: managedMysqlPassword
      });
      await connection.end().catch(() => undefined);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Managed MariaDB did not become ready on 127.0.0.1:${port}. ${errorMessage(lastError)}`);
}

async function getFreeLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error("Could not reserve a local port for managed MariaDB."));
          return;
        }
        resolve(port);
      });
    });
  });
}

function shouldUseManagedMysqlFallback(
  database: Extract<PlaygroundDatabasePlan, { mode: "mysql" }>,
  error: unknown
): boolean {
  return database.server === "external" && isLocalMysqlHost(database.host) && isConnectionUnavailable(error);
}

function isLocalMysqlHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function isConnectionUnavailable(error: unknown): boolean {
  const message = errorMessage(error);
  return (
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEDOUT") ||
    message.includes("ENOTFOUND") ||
    message.includes("EHOSTUNREACH")
  );
}

function createMysqlPrepareError(database: Extract<PlaygroundDatabasePlan, { mode: "mysql" }>, error: unknown): Error {
  return new Error(
    `Could not prepare MySQL database ${database.database} at ${database.host}:${database.port}. ` +
      `Check the Playground MySQL settings and make sure the database server is running. ${errorMessage(error)}`
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describePlaygroundDatabase(database: PlaygroundDatabasePlan): string {
  if (database.mode === "sqlite") {
    return "SQLite";
  }
  if (database.server === "managed-docker") {
    return `Managed MariaDB ${database.host}:${database.port}/${database.database}`;
  }
  return `MySQL ${database.user}@${database.host}:${database.port}/${database.database}`;
}

function escapeMysqlIdentifier(value: string): string {
  return `\`${value.replace(/`/g, "``")}\``;
}

function phpString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function randomSalt(): string {
  return createHash("sha256").update(`${Date.now()}:${Math.random()}:${process.hrtime.bigint()}`).digest("hex");
}

function isLocalPluginTarget(target: string): boolean {
  return target === "." || target.startsWith("..") || target.startsWith(`.${path.sep}`) || path.isAbsolute(target) || pathExists(target);
}

function normalizePlaygroundVersion(version: unknown): string | undefined {
  if (typeof version !== "string") {
    return undefined;
  }

  const trimmed = version.trim();
  return trimmed && trimmed !== "0" ? trimmed : undefined;
}

function parseWordPressBranch(version: string | undefined): { major: number; minor: number } | undefined {
  const match = version?.trim().match(/^(\d+)(?:\.(\d+))?/);
  if (!match) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0)
  };
}

function isWordPressBranchAtLeast(branch: { major: number; minor: number }, major: number, minor: number): boolean {
  return branch.major > major || (branch.major === major && branch.minor >= minor);
}
