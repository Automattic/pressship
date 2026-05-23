import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createHostedDemoBlueprint,
  createLocalDemoBlueprint,
  createPlaygroundCompatibilitySteps,
  createPlaygroundStartArgs,
  getPlaygroundSiteDir,
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
});

describe("plugin demo version resolution", () => {
  it("uses required plugin versions when demo versions are not provided", () => {
    expect(
      resolveDemoPlaygroundOptions(
        {
          reset: false,
          skipBrowser: true
        },
        {
          wp: "6.4",
          php: "8.1"
        }
      )
    ).toMatchObject({
      wp: "6.4",
      php: "8.1"
    });
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
});
