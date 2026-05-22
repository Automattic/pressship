import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createPluginZip, listPackageFiles, stagePluginDirectory } from "../src/package/archive.js";
import { createPluginPack, skippedPackValidation, summarizePackResult, validatePluginPack } from "../src/package/pack.js";
import { summarizeVerifyResult } from "../src/package/verify.js";
import { discoverPluginProject, resolvePluginProjectPath } from "../src/plugin/discover.js";
import { parsePluginHeaders } from "../src/plugin/headers.js";
import { parseReadme, validateReadmeLocally } from "../src/plugin/readme.js";
import { bumpVersion, updatePluginHeaderVersion, updateReadmeStableTag } from "../src/plugin/version.js";

describe("plugin parsing", () => {
  it("parses WordPress plugin headers", () => {
    const headers = parsePluginHeaders(`<?php
/**
 * Plugin Name: Example Plugin
 * Version: 1.2.3
 * Text Domain: example-plugin
 * Requires PHP: 8.1
 */
`);

    expect(headers).toMatchObject({
      pluginName: "Example Plugin",
      version: "1.2.3",
      textDomain: "example-plugin",
      requiresPhp: "8.1"
    });
  });

  it("discovers the main file and readme metadata", async () => {
    const root = await samplePlugin();
    const project = await discoverPluginProject(root);

    expect(project.slug).toBe("example-plugin");
    expect(project.version).toBe("1.2.3");
    expect(path.basename(project.mainFile)).toBe("example-plugin.php");
    expect(project.readme?.stableTag).toBe("1.2.3");
  });

  it("treats a WordPress.org SVN checkout root as the trunk plugin directory", async () => {
    const svnRoot = await sampleSvnCheckout();
    const project = await discoverPluginProject(svnRoot);

    expect(resolvePluginProjectPath(svnRoot)).toEqual({
      inputDir: svnRoot,
      rootDir: path.join(svnRoot, "trunk"),
      svnRootDir: svnRoot
    });
    expect(project.rootDir).toBe(path.join(svnRoot, "trunk"));
    expect(project.mainFile).toBe(path.join(svnRoot, "trunk", "example-plugin.php"));
    expect(project.readmePath).toBe(path.join(svnRoot, "trunk", "readme.txt"));
    expect(project.version).toBe("1.2.3");
  });
});

describe("readme parsing", () => {
  it("flags local readme issues", () => {
    const readme = parseReadme("=== Example ===\nTags: one, two, three, four, five, six\n");
    const findings = validateReadmeLocally("=== Example ===\nTags: one, two, three, four, five, six\n", readme);

    expect(findings.map((finding) => finding.code)).toContain("readme.too_many_tags");
    expect(findings.map((finding) => finding.code)).toContain("readme.missing_stable_tag");
  });
});

describe("packaging", () => {
  it("creates an installable zip with a top-level plugin folder", async () => {
    const root = await samplePlugin();
    await mkdir(path.join(root, ".git", "objects"), { recursive: true });
    await writeFile(path.join(root, ".git", "objects", "ignored"), "");
    await writeFile(path.join(root, ".gitignore"), "node_modules\n");
    await mkdir(path.join(root, "node_modules", "ignored"), { recursive: true });
    await writeFile(path.join(root, "node_modules", "ignored", "file.js"), "");
    await mkdir(path.join(root, ".wordpress-org"), { recursive: true });
    await writeFile(path.join(root, ".wordpress-org", "banner-1544x500.png"), "");
    await mkdir(path.join(root, ".pressship-svn", "example-plugin", "trunk"), { recursive: true });
    await writeFile(path.join(root, ".pressship-svn", "example-plugin", "trunk", "leaked.php"), "");

    const project = await discoverPluginProject(root);
    const files = await listPackageFiles(root);
    const result = await createPluginZip(project, { outputDir: path.join(root, "build-output") });
    const zipBytes = await readFile(result.zipPath);

    expect(files).toEqual(["example-plugin.php", "readme.txt"]);
    expect(result.topLevelFolder).toBe("example-plugin");
    expect(zipBytes.length).toBeGreaterThan(0);
  });

  it("ignores caller-provided glob patterns", async () => {
    const root = await samplePlugin();
    await mkdir(path.join(root, "assets", "videos"), { recursive: true });
    await writeFile(path.join(root, "assets", "videos", "demo.mp4"), "");
    await writeFile(path.join(root, "assets", "poster.jpg"), "");

    const files = await listPackageFiles(root, { ignore: ["assets/**/*.mp4"] });

    expect(files).toEqual(["assets/poster.jpg", "example-plugin.php", "readme.txt"]);
  });

  it("stages the package files for Plugin Check", async () => {
    const root = await samplePlugin();
    const project = await discoverPluginProject(root);
    const stage = await stagePluginDirectory(project, { outputDir: path.join(root, "build-output") });
    const stagedMain = await readFile(path.join(stage.path, "example-plugin.php"), "utf8");

    expect(path.basename(stage.path)).toBe("example-plugin");
    expect(stage.files).toEqual(["example-plugin.php", "readme.txt"]);
    expect(stagedMain).toContain("Plugin Name: Example Plugin");
  });

  it("packs a plugin zip for the npm-style pack command", async () => {
    const root = await samplePlugin();
    const outputDir = path.join(root, "pack-output");
    const result = await createPluginPack(root, { outputDir });

    expect(result.zipPath).toBe(path.join(outputDir, "example-plugin.zip"));
    expect(result.topLevelFolder).toBe("example-plugin");
    expect(result.files).toEqual(["example-plugin.php", "readme.txt"]);
    expect((await readFile(result.zipPath)).length).toBeGreaterThan(0);
  });

  it("packs with caller-provided ignore patterns", async () => {
    const root = await samplePlugin();
    await mkdir(path.join(root, "assets", "videos"), { recursive: true });
    await writeFile(path.join(root, "assets", "videos", "demo.mp4"), "");
    await writeFile(path.join(root, "assets", "poster.jpg"), "");

    const result = await createPluginPack(root, {
      outputDir: path.join(root, "pack-output"),
      ignore: ["assets/**/*.mp4"]
    });

    expect(result.files).toEqual(["assets/poster.jpg", "example-plugin.php", "readme.txt"]);
  });

  it("summarizes pack results for JSON output", async () => {
    const root = await samplePlugin();
    const result = await createPluginPack(root, { outputDir: path.join(root, "pack-output") });
    const summary = summarizePackResult(result, skippedPackValidation());

    expect(summary).toMatchObject({
      zipPath: path.join(root, "pack-output", "example-plugin.zip"),
      topLevelFolder: "example-plugin",
      fileCount: 2,
      files: ["example-plugin.php", "readme.txt"],
      validation: {
        skipped: true,
        readmeFindings: [],
        pluginCheckFindings: []
      }
    });
    expect(summary.sizeBytes).toBeGreaterThan(0);
  });

  it("validates readme and runs Plugin Check before packing", async () => {
    const root = await samplePlugin();
    const project = await discoverPluginProject(root);
    const calls: string[] = [];
    const validation = await validatePluginPack(
      project,
      {
        ignore: ["assets/**/*.mp4"],
        skipReadmeValidator: true,
        wpPath: "/tmp/wordpress"
      },
      {
        validateReadmeFile: async (readmePath, options) => {
          calls.push(`readme:${path.basename(readmePath)}:${String(options.skipRemote)}`);
          return { skippedRemote: true, findings: [] };
        },
        stagePluginDirectory: async (_project, options) => {
          calls.push(`stage:${options.ignore?.join(",")}`);
          return { path: "/tmp/staged/example-plugin", files: [] };
        },
        runPluginCheck: async (target, options) => {
          calls.push(`plugin-check:${target}:${options.mode}:${options.wpPath}`);
          return { skipped: false, available: true, findings: [] };
        }
      }
    );

    expect(calls).toEqual([
      "readme:readme.txt:true",
      "stage:assets/**/*.mp4",
      "plugin-check:/tmp/staged/example-plugin:new:/tmp/wordpress"
    ]);
    expect(validation).toEqual({
      skipped: false,
      readmeFindings: [],
      pluginCheckFindings: []
    });
  });

  it("reports missing readme while still running Plugin Check validation", async () => {
    const root = await samplePlugin({ readme: false });
    const project = await discoverPluginProject(root);
    let pluginCheckRan = false;

    const validation = await validatePluginPack(project, {}, {
      stagePluginDirectory: async () => ({ path: "/tmp/staged/example-plugin", files: [] }),
      runPluginCheck: async () => {
        pluginCheckRan = true;
        return { skipped: false, available: true, findings: [] };
      }
    });

    expect(pluginCheckRan).toBe(true);
    expect(validation.readmeFindings).toEqual([
      {
        severity: "error",
        code: "readme.missing",
        message: "WordPress.org packages require a readme.txt file."
      }
    ]);
  });
});

describe("verification", () => {
  it("summarizes successful verification results", async () => {
    const root = await samplePlugin();
    const project = await discoverPluginProject(root);

    expect(summarizeVerifyResult(project, skippedPackValidation())).toMatchObject({
      ok: true,
      plugin: {
        rootDir: root,
        mainFile: path.join(root, "example-plugin.php"),
        name: "Example Plugin",
        slug: "example-plugin",
        version: "1.2.3",
        readmePath: path.join(root, "readme.txt")
      },
      validation: {
        skipped: true,
        readmeFindings: [],
        pluginCheckFindings: []
      }
    });
  });

  it("marks blocking verification findings as not ok", async () => {
    const root = await samplePlugin();
    const project = await discoverPluginProject(root);

    expect(
      summarizeVerifyResult(project, {
        skipped: false,
        readmeFindings: [
          {
            severity: "error",
            code: "readme.invalid",
            message: "Readme is invalid."
          }
        ],
        pluginCheckFindings: []
      }).ok
    ).toBe(false);
  });
});

describe("version bumps", () => {
  it("bumps semver patch, minor, and major", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  it("updates plugin header and readme stable tag", async () => {
    const root = await samplePlugin();
    const mainFile = path.join(root, "example-plugin.php");
    const readmePath = path.join(root, "readme.txt");

    await updatePluginHeaderVersion(mainFile, "1.2.4");
    await updateReadmeStableTag(readmePath, "1.2.4");

    expect(await readFile(mainFile, "utf8")).toContain(" * Version: 1.2.4");
    expect(await readFile(readmePath, "utf8")).toContain("Stable tag: 1.2.4");
  });
});

async function samplePlugin(options: { readme?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pressship-plugin-"));
  await writeSamplePluginFiles(root, options);
  return root;
}

async function sampleSvnCheckout(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pressship-svn-checkout-"));
  await mkdir(path.join(root, ".svn"), { recursive: true });
  await mkdir(path.join(root, "branches"), { recursive: true });
  await mkdir(path.join(root, "tags"), { recursive: true });
  await mkdir(path.join(root, "trunk"), { recursive: true });
  await writeSamplePluginFiles(path.join(root, "trunk"));
  return root;
}

async function writeSamplePluginFiles(root: string, options: { readme?: boolean } = {}): Promise<void> {
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
  if (options.readme !== false) {
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
  }
}
