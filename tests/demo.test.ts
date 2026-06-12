import path from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  assertDemoLaunchPlanSupported,
  createDemoLaunchPlan,
  createHostedDemoBlueprint,
  createLocalDemoBlueprint,
  createPlaygroundCompatibilitySteps,
  createPlaygroundServerArgs,
  createPlaygroundStartArgs,
  getPlaygroundSiteDir,
  inferPlaygroundPhpVersionForWordPress,
  resolveDemoPlaygroundOptions
} from "../src/plugin/demo.js";
import type { PluginProject } from "../src/types.js";

describe("plugin demo blueprints", () => {
  it("creates a local plugin activation blueprint", () => {
    const project: PluginProject = {
      rootDir: "/tmp/example-plugin",
      mainFile: path.join("/tmp/example-plugin", "example-plugin.php"),
      slug: "example-plugin",
      version: "1.2.3",
      headers: {
        pluginName: "Example Plugin",
        version: "1.2.3"
      }
    };

    expect(createLocalDemoBlueprint(project)).toEqual({
      landingPage: "/wp-admin/plugins.php",
      steps: [
        ...createPlaygroundCompatibilitySteps(),
        {
          step: "activatePlugin",
          pluginName: "Example Plugin",
          pluginPath: "/wordpress/wp-content/plugins/example-plugin/example-plugin.php"
        }
      ]
    });
  });

  it("creates a hosted plugin install and activation blueprint", () => {
    expect(createHostedDemoBlueprint("hello-dolly")).toEqual({
      landingPage: "/wp-admin/plugins.php",
      steps: [
        ...createPlaygroundCompatibilitySteps(),
        {
          step: "installPlugin",
          pluginData: {
            resource: "wordpress.org/plugins",
            slug: "hello-dolly"
          },
          options: {
            activate: true
          }
        }
      ]
    });
  });

  it("creates a compatibility mu-plugin before plugin activation", () => {
    expect(createPlaygroundCompatibilitySteps()).toEqual([
      {
        step: "mkdir",
        path: "/wordpress/wp-content/mu-plugins"
      },
      {
        step: "writeFile",
        path: "/wordpress/wp-content/mu-plugins/pressship-playground-compat.php",
        data: expect.stringContaining("E_USER_DEPRECATED")
      }
    ]);
    expect(createPlaygroundCompatibilitySteps()[1].data).toEqual(expect.stringContaining("wp_set_auth_cookie"));
    expect(createPlaygroundCompatibilitySteps()[1].data).toEqual(expect.stringContaining("wp_create_user('admin', 'password'"));
    expect(createPlaygroundCompatibilitySteps()[1].data).toEqual(expect.stringContaining("send_frame_options_header"));
    expect(createPlaygroundCompatibilitySteps()[1].data).toEqual(expect.stringContaining("header_remove('X-Frame-Options')"));
    expect(createPlaygroundCompatibilitySteps()[1].data).not.toEqual(expect.stringContaining("static function"));
    expect(createPlaygroundCompatibilitySteps()[1].data).not.toEqual(expect.stringContaining(": void"));
  });
});

describe("plugin demo launch args", () => {
  it("creates Playground start args for mounted local plugins", () => {
    expect(
      createPlaygroundStartArgs({
        path: "/tmp/example-plugin",
        blueprintPath: "/tmp/blueprint.json",
        mount: "/tmp/example-plugin:/wordpress/wp-content/plugins/example-plugin",
        options: {
          port: "9401",
          wp: "6.8",
          php: "8.3",
          reset: true,
          skipBrowser: true
        }
      })
    ).toEqual([
      "--yes",
      "@wp-playground/cli@latest",
      "start",
      "--path=/tmp/example-plugin",
      "--blueprint=/tmp/blueprint.json",
      "--define-bool",
      "WP_DEBUG",
      "false",
      "--define-bool",
      "WP_DEBUG_DISPLAY",
      "false",
      "--no-auto-mount",
      "--mount=/tmp/example-plugin:/wordpress/wp-content/plugins/example-plugin",
      "--port=9401",
      "--wp=6.8",
      "--php=8.3",
      "--skip-browser"
    ]);
  });

  it("derives the persisted Playground site directory from the project path", () => {
    expect(getPlaygroundSiteDir("/tmp/example-plugin")).toMatch(
      /\/\.wordpress-playground\/sites\/[a-f0-9]{64}$/
    );
  });

  it("uses a runtime-specific cwd so Playground sites reset per WP/PHP version", async () => {
    const originalConfigDir = process.env.PRESSSHIP_CONFIG_DIR;
    const configDir = await mkdtemp(path.join(tmpdir(), "pressship-demo-config-"));
    process.env.PRESSSHIP_CONFIG_DIR = configDir;
    const pluginRoot = await mkdtemp(path.join(tmpdir(), "pressship-demo-plugin-"));
    await writeFile(
      path.join(pluginRoot, "runtime-plugin.php"),
      `<?php
/**
 * Plugin Name: Runtime Plugin
 * Version: 1.0.0
 * Text Domain: runtime-plugin
 */
`
    );

    try {
      const plan = await createDemoLaunchPlan(pluginRoot, {
        wp: "4.7",
        reset: false,
        skipBrowser: true
      });

      expect(plan.cwd).not.toBe(pluginRoot);
      expect(plan.cwd).toContain(path.join(configDir, "cache", "playground-runtime", "runtime-plugin"));
    expect(plan.siteDir).toBe(getPlaygroundSiteDir(plan.cwd));
    expect(plan.database).toEqual({ mode: "sqlite" });
    expect(plan.args).toContain(`--path=${pluginRoot}`);
      expect(plan.args).toContain(`--mount=${pluginRoot}:/wordpress/wp-content/plugins/runtime-plugin`);
      expect(plan.wpVersion).toBe("4.7");
      expect(plan.phpVersion).toBe("7.4");
    } finally {
      if (originalConfigDir === undefined) {
        delete process.env.PRESSSHIP_CONFIG_DIR;
      } else {
        process.env.PRESSSHIP_CONFIG_DIR = originalConfigDir;
      }
    }
  });
});

describe("plugin demo version resolution", () => {
  it("does not pin minimum plugin requirements as Playground runtime versions", () => {
    const resolved = resolveDemoPlaygroundOptions(
      {
        reset: false,
        skipBrowser: true
      },
      {
        wp: "6.4",
        php: "8.1"
      }
    );

    expect(resolved).toMatchObject({
      reset: false,
      skipBrowser: true
    });
    expect(resolved.wp).toBeUndefined();
    expect(resolved.php).toBeUndefined();
  });

  it("keeps explicit demo versions as overrides", () => {
    expect(
      resolveDemoPlaygroundOptions(
        {
          wp: "6.8",
          php: "8.3",
          reset: false,
          skipBrowser: true
        },
        {
          wp: "6.4",
          php: "8.1"
        }
      )
    ).toMatchObject({
      wp: "6.8",
      php: "8.3"
    });
  });

  it("infers Playground PHP from an explicit WordPress version", () => {
    expect(inferPlaygroundPhpVersionForWordPress("3.5.1")).toBe("5.2");
    expect(inferPlaygroundPhpVersionForWordPress("4.6")).toBe("5.2");
    expect(inferPlaygroundPhpVersionForWordPress("4.7")).toBe("7.4");
    expect(inferPlaygroundPhpVersionForWordPress("4.9")).toBe("7.4");
    expect(inferPlaygroundPhpVersionForWordPress("5.2")).toBe("7.4");
    expect(inferPlaygroundPhpVersionForWordPress("5.5")).toBe("7.4");
    expect(inferPlaygroundPhpVersionForWordPress("5.6")).toBe("8.0");
    expect(inferPlaygroundPhpVersionForWordPress("6.0")).toBe("8.1");
    expect(inferPlaygroundPhpVersionForWordPress("6.3")).toBe("8.2");
    expect(inferPlaygroundPhpVersionForWordPress("6.4")).toBe("8.3");
    expect(inferPlaygroundPhpVersionForWordPress("6.8")).toBe("8.4");
    expect(inferPlaygroundPhpVersionForWordPress("6.9")).toBe("8.5");
    expect(inferPlaygroundPhpVersionForWordPress("latest")).toBeUndefined();
  });

  it("allows old tested-up-to WordPress versions as explicit Playground runtimes", async () => {
    const pluginRoot = await mkdtemp(path.join(tmpdir(), "pressship-demo-old-plugin-"));
    await writeFile(
      path.join(pluginRoot, "old-plugin.php"),
      `<?php
/**
 * Plugin Name: Old Plugin
 * Version: 1.0.0
 * Text Domain: old-plugin
 */
`
    );

    const plan = await createDemoLaunchPlan(pluginRoot, {
      wp: "3.5.1",
      reset: false,
      skipBrowser: true
    });

    expect(plan.wpVersion).toBe("3.5.1");
    expect(plan.phpVersion).toBe("5.2");
    expect(plan.database).toMatchObject({
      mode: "mysql",
      host: "127.0.0.1",
      port: 3306,
      user: "root"
    });
    expect(plan.args).toContain("server");
    expect(plan.args).toContain("--skip-sqlite-setup");
    expect(plan.args).toContain("--wp=3.5.1");
    expect(plan.args).toContain("--php=5.2");
  });

  it("reports old WordPress versions that Playground cannot run", async () => {
    const pluginRoot = await mkdtemp(path.join(tmpdir(), "pressship-demo-unsupported-plugin-"));
    await writeFile(
      path.join(pluginRoot, "unsupported-plugin.php"),
      `<?php
/**
 * Plugin Name: Unsupported Plugin
 * Version: 1.0.0
 * Text Domain: unsupported-plugin
 */
`
    );

    const plan = await createDemoLaunchPlan(pluginRoot, {
      wp: "3.5.1",
      reset: false,
      skipBrowser: true
    });

    expect(() => assertDemoLaunchPlanSupported(plan)).toThrow(/cannot currently run WordPress 3\.5\.1/);
  });

  it("creates Playground server args for MySQL-backed legacy runs", () => {
    expect(
      createPlaygroundServerArgs({
        blueprintPath: "/tmp/blueprint.json",
        mount: "/tmp/example-plugin:/wordpress/wp-content/plugins/example-plugin",
        database: {
          mode: "mysql",
          host: "127.0.0.1",
          port: 3306,
          user: "root",
          password: "",
          database: "pressship_playground_example",
          configPath: "/tmp/wp-config.mysql.php",
          sqliteBypassDir: "/tmp/sqlite-bypass"
        },
        options: {
          port: "9401",
          wp: "3.5.1",
          php: "5.2",
          reset: true,
          skipBrowser: true
        }
      })
    ).toEqual([
      "--yes",
      "@wp-playground/cli@latest",
      "server",
      "--mount-before-install=/tmp/wp-config.mysql.php:/wordpress/wp-config.php",
      "--mount-before-install=/tmp/sqlite-bypass:/wordpress/wp-content/mu-plugins/sqlite-database-integration",
      "--skip-sqlite-setup",
      "--blueprint=/tmp/blueprint.json",
      "--mount=/tmp/example-plugin:/wordpress/wp-content/plugins/example-plugin",
      "--port=9401",
      "--site-url=http://127.0.0.1:9401",
      "--wp=3.5.1",
      "--php=5.2"
    ]);
  });

  it("adds the inferred PHP version unless PHP is explicit", () => {
    expect(
      resolveDemoPlaygroundOptions(
        {
          wp: "4.7",
          reset: false,
          skipBrowser: true
        },
        {}
      )
    ).toMatchObject({
      wp: "4.7",
      php: "7.4"
    });

    expect(
      resolveDemoPlaygroundOptions(
        {
          wp: "4.7",
          php: "8.0",
          reset: false,
          skipBrowser: true
        },
        {}
      )
    ).toMatchObject({
      wp: "4.7",
      php: "8.0"
    });
  });
});
