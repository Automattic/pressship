import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import extract from "extract-zip";
import { describe, expect, it } from "vitest";
import { submit } from "../src/wordpress-org/submit.js";

describe("submit", () => {
  it("loads .pressshipignore for the upload zip and Plugin Check staging", async () => {
    const root = await samplePlugin();
    const outputDir = await mkdtemp(path.join(tmpdir(), "pressship-submit-output-"));
    await mkdir(path.join(root, "assets"), { recursive: true });
    await mkdir(path.join(root, ".git", "objects"), { recursive: true });
    await mkdir(path.join(root, ".svn"), { recursive: true });
    await mkdir(path.join(root, "node_modules", "package"), { recursive: true });
    await writeFile(path.join(root, "assets", "ignored-by-file.txt"), "ignored by file");
    await writeFile(path.join(root, "assets", "ignored-by-option.txt"), "ignored by option");
    await writeFile(path.join(root, "assets", "kept.txt"), "kept");
    await writeFile(path.join(root, ".git", "objects", "leak"), "git");
    await writeFile(path.join(root, ".svn", "entries"), "svn");
    await writeFile(path.join(root, "node_modules", "package", "index.js"), "node");
    await writeFile(
      path.join(root, ".pressshipignore"),
      "assets/ignored-by-file.txt\n!.git/**\n!.svn/**\n!node_modules/**\n"
    );

    await submit(root, {
      dryRun: true,
      verify: false,
      yes: true,
      outputDir,
      ignore: ["assets/ignored-by-option.txt"]
    });

    const extractedDir = path.join(outputDir, "unzipped");
    await extract(path.join(outputDir, "example-plugin.zip"), { dir: extractedDir });
    const zipPluginRoot = path.join(extractedDir, "example-plugin");
    const stagePluginRoot = path.join(outputDir, "plugin-check", "example-plugin");

    await expect(readFile(path.join(zipPluginRoot, "assets", "ignored-by-file.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(zipPluginRoot, "assets", "ignored-by-option.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(stagePluginRoot, "assets", "ignored-by-file.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(stagePluginRoot, "assets", "ignored-by-option.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(zipPluginRoot, ".git", "objects", "leak"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(zipPluginRoot, ".svn", "entries"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(zipPluginRoot, "node_modules", "package", "index.js"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(stagePluginRoot, ".git", "objects", "leak"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(stagePluginRoot, ".svn", "entries"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(stagePluginRoot, "node_modules", "package", "index.js"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(zipPluginRoot, "assets", "kept.txt"), "utf8")).resolves.toBe("kept");
    await expect(readFile(path.join(stagePluginRoot, "assets", "kept.txt"), "utf8")).resolves.toBe("kept");
  });
});

async function samplePlugin(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pressship-submit-plugin-"));
  await writeFile(
    path.join(root, "example-plugin.php"),
    `<?php
/**
 * Plugin Name: Example Plugin
 * Description: Does example things.
 * Version: 1.2.3
 * Text Domain: example-plugin
 */
`
  );
  await writeFile(
    path.join(root, "readme.txt"),
    `=== Example Plugin ===
Contributors: example
Tags: example, tools
Requires at least: 6.0
Tested up to: 6.8
Stable tag: 1.2.3
Requires PHP: 8.1
License: GPLv2 or later

== Description ==
Does example things.
`
  );
  return root;
}
