import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getManagedWpConfig, getSqliteDropInFromTemplate } from "../src/checks/plugin-check-environment.js";
import { normalizePluginCheckFindingPaths, parsePluginCheckOutput } from "../src/checks/plugin-check.js";
import { parseReadmeValidatorText } from "../src/checks/readme-validator.js";

describe("Plugin Check output parsing", () => {
  it("normalizes strict JSON findings", () => {
    const findings = parsePluginCheckOutput(
      JSON.stringify([
        {
          type: "ERROR",
          code: "late_escaping",
          message: "All output should be escaped.",
          file: "example.php",
          line: 12,
          column: 8
        }
      ])
    );

    expect(findings).toEqual([
      {
        severity: "error",
        code: "late_escaping",
        message: "All output should be escaped.",
        file: "example.php",
        line: 12,
        column: 8
      }
    ]);
  });

  it("treats a missing WordPress path as a setup warning", () => {
    const findings = parsePluginCheckOutput(
      "Warning: No WordPress installation found. If the command 'plugin check plugin.zip' is in a plugin or theme, pass --path=`path/to/wordpress`.\nError: 'check' is not a registered subcommand of 'plugin'.",
      1
    );

    expect(findings).toEqual([
      {
        severity: "warning",
        code: "plugin_check.wordpress_path_missing",
        message:
          "WP-CLI could not find a WordPress installation. Re-run with `--wp-path /path/to/wordpress`, or use `--skip-plugin-check`."
      }
    ]);
  });

  it("treats a missing Plugin Check command as a setup warning", () => {
    const findings = parsePluginCheckOutput("Error: 'check' is not a registered subcommand of 'plugin'.", 1);

    expect(findings).toEqual([
      {
        severity: "warning",
        code: "plugin_check.command_missing",
        message:
          "WP-CLI is available, but `wp plugin check` is not registered. Install and activate the WordPress.org Plugin Check plugin in your WordPress install, then pass `--wp-path /path/to/wordpress`, or use `--skip-plugin-check`."
      }
    ]);
  });

  it("repairs macOS /private path prefixes leaked into relative finding files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pressship-plugin-check-"));
    await mkdir(path.join(root, "includes"), { recursive: true });
    await writeFile(path.join(root, "includes", "class-rest-controller.php"), "<?php\n");

    const findings = await normalizePluginCheckFindingPaths(
      [
        {
          severity: "error",
          code: "example.error",
          message: "Example finding.",
          file: "/privateincludes/class-rest-controller.php",
          line: 12
        }
      ],
      root
    );

    expect(findings[0]).toMatchObject({
      file: "includes/class-rest-controller.php",
      line: 12
    });
  });
});

describe("managed Plugin Check environment", () => {
  it("creates a minimal WordPress config for WP-CLI bootstrap", () => {
    const config = getManagedWpConfig();

    expect(config).toContain("define( 'DB_NAME', 'pressship_plugin_check' );");
    expect(config).toContain("require_once ABSPATH . 'wp-settings.php';");
  });

  it("creates a configured SQLite db.php drop-in", () => {
    const dropIn = getSqliteDropInFromTemplate(
      "{SQLITE_IMPLEMENTATION_FOLDER_PATH}\n{SQLITE_PLUGIN}",
      "/tmp/wordpress/wp-content/plugins/sqlite-database-integration"
    );

    expect(dropIn).toBe(
      "/tmp/wordpress/wp-content/plugins/sqlite-database-integration\nsqlite-database-integration/load.php"
    );
  });
});

describe("readme validator parsing", () => {
  it("extracts warning and error lines from WordPress.org text", () => {
    const findings = parseReadmeValidatorText(`Readme Validator
Warning: Tags should be fewer than 5.
Error: Stable tag is missing.
`);

    expect(findings).toEqual([
      {
        severity: "warning",
        code: "readme_validator.remote",
        message: "Tags should be fewer than 5."
      },
      {
        severity: "error",
        code: "readme_validator.remote",
        message: "Stable tag is missing."
      }
    ]);
  });
});
