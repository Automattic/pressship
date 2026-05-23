import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startWebServer } from "../src/web/server.js";

const originalConfigDir = process.env.PRESSSHIP_CONFIG_DIR;

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PRESSSHIP_CONFIG_DIR;
  } else {
    process.env.PRESSSHIP_CONFIG_DIR = originalConfigDir;
  }
});

describe("studio server", () => {
  it("serves the app, bootstraps state, and guards mutating APIs", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();
    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const html = await fetch(server.url).then((response) => response.text());
      expect(html).toContain("Pressship");
      expect(html).toContain(server.token);

      const bootstrap = await fetch(new URL("/api/bootstrap", server.url)).then((response) => response.json());
      expect(bootstrap).toMatchObject({
        token: server.token,
        configDir: process.env.PRESSSHIP_CONFIG_DIR,
        playgrounds: []
      });

      const playgrounds = await fetch(new URL("/api/playgrounds", server.url)).then((response) => response.json());
      expect(playgrounds).toEqual({ playgrounds: [] });

      const blocked = await fetch(new URL("/api/plugins/local", server.url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pluginRoot })
      });
      expect(blocked.status).toBe(403);

      const added = await fetch(new URL("/api/plugins/local", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ path: pluginRoot })
      }).then((response) => response.json());
      expect(added).toMatchObject({ slug: "example-plugin" });

      const local = await fetch(new URL("/api/plugins/local", server.url)).then((response) => response.json());
      expect(local.plugins).toHaveLength(1);

      const files = await fetch(new URL(`/api/plugins/local/${added.id}/files`, server.url)).then((response) =>
        response.json()
      );
      expect(files.files.map((file: { path: string }) => file.path)).toContain("example-plugin.php");

      const contentUrl = new URL(`/api/plugins/local/${added.id}/files/content`, server.url);
      contentUrl.searchParams.set("path", "example-plugin.php");
      const fileContent = await fetch(contentUrl).then((response) => response.json());
      expect(fileContent.content).toContain("Plugin Name: Example Plugin");

      const saved = await fetch(contentUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({
          path: "example-plugin.php",
          content: fileContent.content.replace("Version: 1.2.3", "Version: 1.2.4")
        })
      }).then((response) => response.json());
      expect(saved).toMatchObject({ path: "example-plugin.php" });

      const updated = await fetch(contentUrl).then((response) => response.json());
      expect(updated.content).toContain("Version: 1.2.4");
    } finally {
      await server.close();
    }
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
