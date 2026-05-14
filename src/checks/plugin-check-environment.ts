import { createWriteStream } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { execa } from "execa";
import extract from "extract-zip";
import { ui } from "../ui.js";
import { ensureCacheDir, pathExists } from "../utils/paths.js";

const wpCliUrl = "https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar";
const pluginCheckZipUrl = "https://downloads.wordpress.org/plugin/plugin-check.zip";
const sqliteIntegrationZipUrl = "https://downloads.wordpress.org/plugin/sqlite-database-integration.zip";

export type WpCliCommand = {
  command: string;
  baseArgs: string[];
};

export type ManagedPluginCheckEnvironment = {
  wpCli: WpCliCommand;
  wpPath: string;
  requirePath: string;
};

export async function prepareManagedPluginCheckEnvironment(): Promise<ManagedPluginCheckEnvironment> {
  const cacheDir = await ensureCacheDir();
  const wpCli = await resolveWpCli(cacheDir);
  const wpPath = path.join(cacheDir, "wordpress");

  await ensureWordPressCore(wpCli, wpPath);
  const requirePath = await ensurePluginCheckPlugin(wpPath);

  return {
    wpCli,
    wpPath,
    requirePath
  };
}

export async function resolveWpCli(cacheDir: string): Promise<WpCliCommand> {
  const systemWp = await execa("wp", ["--version"], { reject: false });
  if (systemWp.exitCode === 0) {
    return { command: "wp", baseArgs: [] };
  }

  const pharPath = path.join(cacheDir, "wp-cli.phar");
  if (!pathExists(pharPath)) {
    ui.info("Downloading WP-CLI for managed Plugin Check.");
    await downloadFile(wpCliUrl, pharPath);
    await chmod(pharPath, 0o755);
  }

  const phpAvailable = await execa("php", ["--version"], { reject: false });
  if (phpAvailable.exitCode !== 0) {
    throw new Error("PHP is required to run the managed WP-CLI phar, but `php` was not found.");
  }

  return { command: "php", baseArgs: [pharPath] };
}

async function ensureWordPressCore(wpCli: WpCliCommand, wpPath: string): Promise<void> {
  if (!pathExists(path.join(wpPath, "wp-includes", "version.php"))) {
    await mkdir(wpPath, { recursive: true });
    ui.info("Downloading WordPress core for managed Plugin Check.");
    await runWpCli(wpCli, ["core", "download", `--path=${wpPath}`, "--skip-content", "--force"]);
  }

  await ensureSqliteIntegration(wpPath);
  await ensureWpConfig(wpPath);
  await ensureWordPressInstalled(wpCli, wpPath);
}

export async function ensureWpConfig(wpPath: string): Promise<void> {
  const configPath = path.join(wpPath, "wp-config.php");
  if (pathExists(configPath)) {
    return;
  }

  await writeFile(configPath, getManagedWpConfig(), { mode: 0o600 });
}

export function getManagedWpConfig(): string {
  return `<?php
/**
 * Managed by Pressship for static WordPress.org Plugin Check runs.
 *
 * The checker runs without a real site database for static checks, but WP-CLI
 * still requires wp-config.php to bootstrap WordPress.
 */
define( 'DB_NAME', 'pressship_plugin_check' );
define( 'DB_USER', 'pressship' );
define( 'DB_PASSWORD', 'pressship' );
define( 'DB_HOST', '127.0.0.1' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'AUTH_KEY',         'pressship-auth-key' );
define( 'SECURE_AUTH_KEY',  'pressship-secure-auth-key' );
define( 'LOGGED_IN_KEY',    'pressship-logged-in-key' );
define( 'NONCE_KEY',        'pressship-nonce-key' );
define( 'AUTH_SALT',        'pressship-auth-salt' );
define( 'SECURE_AUTH_SALT', 'pressship-secure-auth-salt' );
define( 'LOGGED_IN_SALT',   'pressship-logged-in-salt' );
define( 'NONCE_SALT',       'pressship-nonce-salt' );

$table_prefix = 'wp_';

if ( ! defined( 'ABSPATH' ) ) {
\tdefine( 'ABSPATH', __DIR__ . '/' );
}

require_once ABSPATH . 'wp-settings.php';
`;
}

export async function ensureSqliteIntegration(wpPath: string): Promise<void> {
  const pluginDir = path.join(wpPath, "wp-content", "plugins", "sqlite-database-integration");
  const dropInPath = path.join(wpPath, "wp-content", "db.php");
  const dropInTemplatePath = path.join(pluginDir, "db.copy");

  if (!pathExists(dropInTemplatePath)) {
    const pluginsDir = path.dirname(pluginDir);
    const zipPath = path.join(pluginsDir, "sqlite-database-integration.zip");

    await mkdir(pluginsDir, { recursive: true });
    ui.info("Downloading SQLite integration for managed WordPress.");
    await downloadFile(sqliteIntegrationZipUrl, zipPath);
    await rm(pluginDir, { recursive: true, force: true });
    await extract(zipPath, { dir: pluginsDir });
    await rm(zipPath, { force: true });
  }

  if (!pathExists(dropInTemplatePath)) {
    throw new Error("Downloaded SQLite integration, but could not find its db.copy drop-in template.");
  }

  await writeFile(dropInPath, await getSqliteDropIn(dropInTemplatePath, pluginDir), { mode: 0o644 });
}

export async function getSqliteDropIn(dropInTemplatePath: string, pluginDir: string): Promise<string> {
  return getSqliteDropInFromTemplate(await readFile(dropInTemplatePath, "utf8"), pluginDir);
}

export function getSqliteDropInFromTemplate(template: string, pluginDir: string): string {
  const normalizedPluginDir = pluginDir.replace(/\\/g, "/");

  return template
    .replaceAll("{SQLITE_IMPLEMENTATION_FOLDER_PATH}", normalizedPluginDir)
    .replaceAll("{SQLITE_PLUGIN}", "sqlite-database-integration/load.php");
}

async function ensureWordPressInstalled(wpCli: WpCliCommand, wpPath: string): Promise<void> {
  const isInstalled = await runWpCli(wpCli, ["core", "is-installed", `--path=${wpPath}`], {
    capture: true,
    reject: false
  });

  if (isInstalled.exitCode === 0) {
    return;
  }

  ui.info("Installing managed WordPress site with SQLite.");
  await runWpCli(wpCli, [
    "core",
    "install",
    `--path=${wpPath}`,
    "--url=http://pressship.local",
    "--title=Pressship Plugin Check",
    "--admin_user=pressship",
    "--admin_password=pressship",
    "--admin_email=pressship@example.invalid",
    "--skip-email"
  ]);
}

async function ensurePluginCheckPlugin(wpPath: string): Promise<string> {
  const pluginDir = path.join(wpPath, "wp-content", "plugins", "plugin-check");
  const pluginMainPath = path.join(pluginDir, "plugin.php");
  const cliPath = path.join(pluginDir, "cli.php");
  const requirePath = path.join(wpPath, "wp-content", "pressship-plugin-check-loader.php");

  if (pathExists(pluginMainPath) && pathExists(cliPath)) {
    await writePluginCheckLoader(requirePath, pluginMainPath, pluginDir, cliPath);
    return requirePath;
  }

  const pluginsDir = path.dirname(pluginDir);
  const zipPath = path.join(pluginsDir, "plugin-check.zip");

  await mkdir(pluginsDir, { recursive: true });
  ui.info("Downloading WordPress.org Plugin Check.");
  await downloadFile(pluginCheckZipUrl, zipPath);
  await rm(pluginDir, { recursive: true, force: true });
  await extract(zipPath, { dir: pluginsDir });
  await rm(zipPath, { force: true });

  if (!pathExists(pluginMainPath) || !pathExists(cliPath)) {
    throw new Error("Downloaded Plugin Check, but could not find its WP-CLI loader at plugin-check/cli.php.");
  }

  await writePluginCheckLoader(requirePath, pluginMainPath, pluginDir, cliPath);
  return requirePath;
}

async function writePluginCheckLoader(
  loaderPath: string,
  pluginMainPath: string,
  pluginDir: string,
  cliPath: string
): Promise<void> {
  await writeFile(
    loaderPath,
    `<?php
/**
 * Managed by Pressship to load Plugin Check for WP-CLI.
 */
if ( ! defined( 'WP_PLUGIN_CHECK_VERSION' ) ) {
\tdefine( 'WP_PLUGIN_CHECK_VERSION', '1.9.0' );
}
if ( ! defined( 'WP_PLUGIN_CHECK_MINIMUM_PHP' ) ) {
\tdefine( 'WP_PLUGIN_CHECK_MINIMUM_PHP', '7.4' );
}
if ( ! defined( 'WP_PLUGIN_CHECK_MAIN_FILE' ) ) {
\tdefine( 'WP_PLUGIN_CHECK_MAIN_FILE', ${JSON.stringify(pluginMainPath)} );
}
if ( ! defined( 'WP_PLUGIN_CHECK_PLUGIN_DIR_PATH' ) ) {
\tdefine( 'WP_PLUGIN_CHECK_PLUGIN_DIR_PATH', ${JSON.stringify(pluginDir.endsWith(path.sep) ? pluginDir : `${pluginDir}${path.sep}`)} );
}
if ( ! defined( 'WP_PLUGIN_CHECK_PLUGIN_DIR_URL' ) ) {
\tdefine( 'WP_PLUGIN_CHECK_PLUGIN_DIR_URL', '' );
}
require_once ${JSON.stringify(cliPath)};
`,
    { mode: 0o644 }
  );
}

async function runWpCli(
  wpCli: WpCliCommand,
  args: string[],
  options: { capture?: boolean; reject?: boolean } = {}
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const result = await execa(wpCli.command, [...wpCli.baseArgs, ...args], {
    reject: false,
    stdout: options.capture ? "pipe" : "inherit",
    stderr: options.capture ? "pipe" : "inherit"
  });

  if (options.reject !== false && result.exitCode !== 0) {
    throw new Error(`WP-CLI command failed: ${[wpCli.command, ...wpCli.baseArgs, ...args].join(" ")}`);
  }

  return {
    exitCode: result.exitCode ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${url}: ${response.status} ${response.statusText}`);
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await pipeline(response.body, createWriteStream(destination));
}
