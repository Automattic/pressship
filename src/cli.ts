#!/usr/bin/env node
import { Command } from "commander";
import { login } from "./auth/login.js";
import { logout } from "./auth/logout.js";
import { whoami, type WhoamiOptions } from "./auth/whoami.js";
import { pack, type PackOptions } from "./package/pack.js";
import { verify, type VerifyOptions } from "./package/verify.js";
import { publish, type PublishOptions } from "./wordpress-org/publish.js";
import { submit, type SubmitOptions } from "./wordpress-org/submit.js";
import { status, type StatusOptions } from "./wordpress-org/state.js";
import { getPlugin, type GetOptions } from "./svn/get.js";
import { release, type ReleaseOptions } from "./svn/release.js";
import { demo, type DemoOptions } from "./plugin/demo.js";
import { info, type InfoOptions } from "./plugin/info.js";
import { listPlugins, type ListOptions } from "./plugin/list.js";
import { version } from "./plugin/version.js";
import { studio, type StudioOptions } from "./web/index.js";

const program = new Command();

program
  .name("pressship")
  .description("Submit and release WordPress.org plugins from the command line.")
  .version("0.1.0");

program
  .command("login")
  .description("Open a browser and save a WordPress.org login session.")
  .action(run(login));

program
  .command("logout")
  .description("Remove the saved WordPress.org browser session.")
  .action(run(logout));

program
  .command("whoami")
  .description("Print the WordPress.org username for the saved login session.")
  .option("--json", "Print account details as JSON")
  .action((options: WhoamiOptions) => run(() => whoami(options))());

program
  .command("demo")
  .description("Start a local WordPress Playground demo for a plugin path or WordPress.org slug.")
  .argument("[slug-or-path]", "Local plugin path, WordPress.org plugin slug, or plugin URL")
  .option("--port <port>", "Port for the local Playground server")
  .option("--wp <version>", "WordPress version to use")
  .option("--php <version>", "PHP version to use")
  .option("--reset", "Reset the persisted Playground site before starting")
  .option("--skip-browser", "Start the local server without opening a browser")
  .action((target: string | undefined, options: DemoOptions) => run(() => demo(target, options))());

program
  .command("info")
  .description("Show detailed info for a local plugin path or WordPress.org plugin slug.")
  .argument("[slug-or-path]", "Local plugin path, WordPress.org plugin slug, or plugin URL")
  .option("--remote", "Fetch hosted WordPress.org plugin info even when the target is local")
  .option("--json", "Print plugin info as JSON")
  .action((target: string | undefined, options: InfoOptions) => run(() => info(target, options))());

program
  .command("studio")
  .description("Start Pressship Studio.")
  .option("--host <host>", "Host to bind", "127.0.0.1")
  .option("--port <port>", "Port for Pressship Studio")
  .option("--no-open", "Start without opening a browser")
  .action((options: StudioOptions) => run(() => studio(options))());

program
  .command("ls")
  .alias("list")
  .description("List WordPress.org plugins for the saved account or a public profile username.")
  .argument("[username]", "WordPress.org username. Defaults to the saved login user.")
  .option("--public", "Use the public author archive even for the saved login user")
  .option("--json", "Print plugin list as JSON")
  .action((username: string | undefined, options: ListOptions) => run(() => listPlugins(username, options))());

program
  .command("get")
  .description("Checkout or update a WordPress.org plugin SVN repository.")
  .argument("<slug>", "WordPress.org plugin slug or plugin URL")
  .argument("[path]", "Destination directory. Defaults to ./<slug>.")
  .option("--json", "Print checkout details as JSON")
  .option("--no-install-svn", "Do not try to install Subversion automatically when svn is missing")
  .action((slug: string, destination: string | undefined, options: GetOptions) =>
    run(() => getPlugin(slug, destination, options))()
  );

program
  .command("publish")
  .description("Submit for review or release an approved plugin, similar to npm publish.")
  .argument("[plugin-path]", "Path to the WordPress plugin directory")
  .option("--submit", "Force WordPress.org review submission")
  .option("--release", "Force WordPress.org SVN release")
  .option("--dry-run", "Run the selected publish flow without uploading or committing")
  .option("--no-verify", "Skip readme validation and Plugin Check before publishing")
  .option("--skip-plugin-check", "Skip `wp plugin check` for submit flows")
  .option("--skip-readme-validator", "Skip the remote WordPress.org readme validator for submit flows")
  .option("--output-dir <path>", "Directory where the submission zip should be written")
  .option("--wp-path <path>", "WordPress installation path for `wp plugin check`")
  .option("--slug <slug>", "Approved WordPress.org plugin slug for release detection or release")
  .option("--version <version>", "Version tag to create for release")
  .option("--svn-dir <path>", "Local SVN working copy directory for release")
  .option("--username <username>", "WordPress.org SVN username for release; defaults to the saved login user")
  .option("-m, --message <message>", "SVN commit message for release")
  .option("--no-install-svn", "Do not try to install Subversion automatically when svn is missing")
  .option("--ignore <glob>", "Ignore files in the package; repeat for multiple globs", collectValues, [])
  .option("-y, --yes", "Continue without interactive confirmations where possible")
  .action((pluginPath: string | undefined, options: PublishOptions) => run(() => publish(pluginPath, options))());

program
  .command("verify")
  .description("Run readme validation and Plugin Check without packaging or publishing.")
  .argument("[plugin-path]", "Path to the WordPress plugin directory")
  .option("--ignore <glob>", "Ignore files while staging Plugin Check; repeat for multiple globs", collectValues, [])
  .option("--skip-readme-validator", "Skip the remote WordPress.org readme validator")
  .option("--wp-path <path>", "WordPress installation path for `wp plugin check`")
  .option("--json", "Print verification details as JSON")
  .action((pluginPath: string | undefined, options: VerifyOptions) => run(() => verify(pluginPath, options))());

program
  .command("pack")
  .description("Create a WordPress-installable plugin zip, similar to npm pack.")
  .argument("[plugin-path]", "Path to the WordPress plugin directory")
  .option("--output-dir <path>", "Directory where the plugin zip should be written")
  .option("--ignore <glob>", "Ignore files in the package; repeat for multiple globs", collectValues, [])
  .option("--no-verify", "Create the zip without readme validation or Plugin Check")
  .option("--skip-readme-validator", "Skip the remote WordPress.org readme validator")
  .option("--wp-path <path>", "WordPress installation path for `wp plugin check`")
  .option("--json", "Print package details as JSON")
  .action((pluginPath: string | undefined, options: PackOptions) => run(() => pack(pluginPath, options))());

program
  .command("submit")
  .description("Validate, package, and submit a plugin zip to WordPress.org for review.")
  .argument("[plugin-path]", "Path to the WordPress plugin directory")
  .option("--dry-run", "Run validation and packaging without uploading")
  .option("--no-verify", "Skip readme validation and Plugin Check")
  .option("--skip-plugin-check", "Skip `wp plugin check`")
  .option("--skip-readme-validator", "Skip the remote WordPress.org readme validator")
  .option("--output-dir <path>", "Directory where the submission zip should be written")
  .option("--wp-path <path>", "WordPress installation path for `wp plugin check`")
  .option("--ignore <glob>", "Ignore files in the package; repeat for multiple globs", collectValues, [])
  .option("-y, --yes", "Continue without interactive confirmations where possible")
  .action((pluginPath: string | undefined, options: SubmitOptions) => run(() => submit(pluginPath, options))());

program
  .command("status")
  .description("Show current WordPress.org review state for submitted plugins.")
  .argument("[plugin-path-or-slug]", "Filter by local plugin path, plugin slug, or display name")
  .option("--json", "Print state as JSON")
  .action((slugOrName: string | undefined, options: StatusOptions) => run(() => status(slugOrName, options))());

program
  .command("version")
  .description("Bump the local plugin Version header and readme Stable tag.")
  .argument("<patch|minor|major>", "Version bump type")
  .argument("[plugin-path]", "Path to the WordPress plugin directory")
  .action((bump: string, pluginPath: string | undefined) => run(() => version(bump, pluginPath))());

program
  .command("release")
  .description("Publish an approved plugin release to WordPress.org SVN trunk and tags.")
  .argument("[plugin-path]", "Path to the WordPress plugin directory")
  .option("--slug <slug>", "Approved WordPress.org plugin slug")
  .option("--version <version>", "Version tag to create")
  .option("--svn-dir <path>", "Local SVN working copy directory")
  .option("--username <username>", "WordPress.org SVN username; defaults to the saved login user")
  .option("-m, --message <message>", "SVN commit message")
  .option("--no-verify", "Skip readme validation and Plugin Check before the SVN release")
  .option("--skip-readme-validator", "Skip the remote WordPress.org readme validator")
  .option("--wp-path <path>", "WordPress installation path for `wp plugin check`")
  .option("--ignore <glob>", "Ignore files in the SVN release; repeat for multiple globs", collectValues, [])
  .option("--dry-run", "Print the SVN command plan without changing SVN")
  .option("-y, --yes", "Commit without the final confirmation prompt")
  .option("--no-install-svn", "Do not try to install Subversion automatically when svn is missing")
  .action((pluginPath: string | undefined, options: ReleaseOptions) => run(() => release(pluginPath, options))());

await program.parseAsync(process.argv);

function run(action: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await action();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  };
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}
