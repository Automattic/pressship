#!/usr/bin/env node
import { Command } from "commander";
import { login } from "./auth/login.js";
import { logout } from "./auth/logout.js";
import { whoami, type WhoamiOptions } from "./auth/whoami.js";
import { submit, type SubmitOptions } from "./wordpress-org/submit.js";
import { status, type StatusOptions } from "./wordpress-org/state.js";
import { release, type ReleaseOptions } from "./svn/release.js";
import { version } from "./plugin/version.js";

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
  .command("submit")
  .description("Validate, package, and submit a plugin zip to WordPress.org for review.")
  .argument("[plugin-path]", "Path to the WordPress plugin directory")
  .option("--dry-run", "Run validation and packaging without uploading")
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
  .option("--username <username>", "WordPress.org SVN username")
  .option("-m, --message <message>", "SVN commit message")
  .option("--ignore <glob>", "Ignore files in the SVN release; repeat for multiple globs", collectValues, [])
  .option("--dry-run", "Print the SVN command plan without changing SVN")
  .option("-y, --yes", "Commit without the final confirmation prompt")
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
