import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addLocalPluginPath,
  listLocalPlugins,
  pluginPathId,
  readLocalPluginRegistry,
  removeLocalPlugin
} from "../src/web/registry.js";

const originalConfigDir = process.env.PRESSSHIP_CONFIG_DIR;

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PRESSSHIP_CONFIG_DIR;
  } else {
    process.env.PRESSSHIP_CONFIG_DIR = originalConfigDir;
  }
});

describe("studio local plugin registry", () => {
  it("adds, enriches, dedupes, and removes local plugin paths", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();

    const added = await addLocalPluginPath(pluginRoot, "manual");
    await addLocalPluginPath(pluginRoot, "clone");

    expect(added.id).toBe(pluginPathId(pluginRoot));
    expect(await readLocalPluginRegistry()).toMatchObject({
      version: 1,
      plugins: [
        {
          id: added.id,
          source: "clone",
          slug: "example-plugin",
          name: "Example Plugin"
        }
      ]
    });

    const plugins = await listLocalPlugins();
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      exists: true,
      info: {
        name: "Example Plugin",
        version: "1.2.3"
      }
    });

    await expect(removeLocalPlugin(added.id)).resolves.toBe(true);
    await expect(removeLocalPlugin(added.id)).resolves.toBe(false);
  });
});

async function samplePlugin(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pressship-studio-plugin-"));
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, "example-plugin.php"),
    `<?php
/**
 * Plugin Name: Example Plugin
 * Version: 1.2.3
 * Text Domain: example-plugin
 */
`
  );
  await writeFile(
    path.join(root, "readme.txt"),
    `=== Example Plugin ===
Contributors: example
Tags: example
Stable tag: 1.2.3

== Description ==
Example.
`
  );
  return root;
}
