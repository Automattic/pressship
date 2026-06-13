import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureSvnAvailable: vi.fn(),
  execa: vi.fn(),
  resolveSvnCredentials: vi.fn(),
  resolveSvnUsername: vi.fn(),
  validatePluginPack: vi.fn()
}));

vi.mock("../src/package/pack.js", () => ({
  validatePluginPack: mocks.validatePluginPack
}));

vi.mock("../src/svn/credentials.js", () => ({
  resolveSvnCredentials: mocks.resolveSvnCredentials,
  resolveSvnUsername: mocks.resolveSvnUsername
}));

vi.mock("../src/svn/subversion.js", () => ({
  ensureSvnAvailable: mocks.ensureSvnAvailable,
  isSvnAvailable: vi.fn(async () => true)
}));

vi.mock("execa", () => ({
  execa: mocks.execa
}));

import { release } from "../src/svn/release.js";

describe("SVN release verification", () => {
  beforeEach(() => {
    mocks.ensureSvnAvailable.mockReset().mockResolvedValue(undefined);
    mocks.execa.mockReset().mockResolvedValue({ exitCode: 0, failed: false, stdout: "", stderr: "" });
    mocks.resolveSvnCredentials.mockReset().mockResolvedValue({ username: "WpUser", password: "svn-password" });
    mocks.resolveSvnUsername.mockReset().mockResolvedValue("WpUser");
    mocks.validatePluginPack.mockReset().mockResolvedValue({
      skipped: false,
      readmeFindings: [],
      pluginCheckFindings: []
    });
  });

  it("verifies readme and Plugin Check before preparing the SVN working copy", async () => {
    const pluginRoot = await samplePlugin();
    const svnDir = path.join(await mkdtemp(path.join(tmpdir(), "pressship-svn-release-")), "example-plugin");
    mocks.validatePluginPack.mockResolvedValue({
      skipped: false,
      readmeFindings: [
        {
          severity: "error",
          code: "readme.invalid",
          message: "Readme is invalid."
        }
      ],
      pluginCheckFindings: []
    });

    await expect(release(pluginRoot, { svnDir, yes: true })).rejects.toThrow("Release verification");

    expect(mocks.validatePluginPack).toHaveBeenCalledOnce();
    expect(mocks.ensureSvnAvailable).not.toHaveBeenCalled();
    expect(mocks.execa).not.toHaveBeenCalled();
  });

  it("skips release verification when --no-verify is mapped to verify false", async () => {
    const pluginRoot = await samplePlugin();
    const svnDir = path.join(await mkdtemp(path.join(tmpdir(), "pressship-svn-release-")), "example-plugin");

    await release(pluginRoot, { svnDir, verify: false, yes: true });

    expect(mocks.validatePluginPack).not.toHaveBeenCalled();
    expect(mocks.ensureSvnAvailable).toHaveBeenCalledOnce();
    expect(mocks.execa).toHaveBeenCalledWith("svn", ["info"], expect.any(Object));
  });

  it("syncs only package-included files into SVN trunk from a non-trunk source", async () => {
    const pluginRoot = await samplePlugin();
    await writeFile(path.join(pluginRoot, "ignored.php"), "<?php\n// ignored locally\n");
    await writeFile(path.join(pluginRoot, ".pressshipignore"), "ignored.php\n");
    await mkdir(path.join(pluginRoot, ".wordpress-org"), { recursive: true });
    await writeFile(path.join(pluginRoot, ".wordpress-org", "banner-1544x500.png"), "banner");
    const svnDir = path.join(await mkdtemp(path.join(tmpdir(), "pressship-svn-release-")), "example-plugin");

    await release(pluginRoot, { svnDir, verify: false, yes: true });

    await expect(readFile(path.join(svnDir, "trunk", "ignored.php"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(svnDir, "trunk", "example-plugin.php"), "utf8")).resolves.toContain(
      "Plugin Name: Example Plugin"
    );
    await expect(readFile(path.join(svnDir, "assets", "banner-1544x500.png"), "utf8")).resolves.toBe("banner");

    const svnCalls = mocks.execa.mock.calls.map(([, args]) => args as string[]);
    expect(svnCalls.some((args) => args[0] === "add" && args.includes("trunk/ignored.php"))).toBe(false);
    expect(svnCalls.some((args) => args[0] === "add" && args.includes("assets/banner-1544x500.png"))).toBe(true);
  });

  it("keeps ignored trunk files locally while removing versioned copies from SVN", async () => {
    const svnDir = path.join(await mkdtemp(path.join(tmpdir(), "pressship-svn-release-")), "example-plugin");
    await mkdir(path.join(svnDir, ".svn"), { recursive: true });
    const trunkDir = path.join(svnDir, "trunk");
    await mkdir(trunkDir, { recursive: true });
    await writeSamplePluginFiles(trunkDir);
    await writeFile(path.join(trunkDir, "ignored.php"), "<?php\n// keep local\n");
    await writeFile(path.join(trunkDir, ".pressshipignore"), "ignored.php\n");
    mocks.execa.mockImplementation(async (_command, args) => {
      const svnArgs = args as string[];
      if (svnArgs[0] === "list" && svnArgs[1] === "-R" && svnArgs[2] === "trunk") {
        return {
          exitCode: 0,
          failed: false,
          stdout: "example-plugin.php\nignored.php\nreadme.txt\n",
          stderr: ""
        };
      }
      if (svnArgs[0] === "status") {
        return {
          exitCode: 0,
          failed: false,
          stdout: "?       trunk/ignored.php\n",
          stderr: ""
        };
      }
      return { exitCode: 0, failed: false, stdout: "", stderr: "" };
    });

    await release(trunkDir, { svnDir, verify: false, yes: true });

    expect(await readFile(path.join(trunkDir, "ignored.php"), "utf8")).toContain("keep local");
    const svnCalls = mocks.execa.mock.calls.map(([, args]) => args as string[]);
    expect(svnCalls).toContainEqual(["delete", "--keep-local", "trunk/ignored.php"]);
    expect(svnCalls.some((args) => args[0] === "add" && args.includes("trunk/ignored.php"))).toBe(false);
    expect(svnCalls.some((args) => args[0] === "commit")).toBe(false);
  });
});

async function samplePlugin(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pressship-plugin-"));
  await mkdir(root, { recursive: true });
  await writeSamplePluginFiles(root);
  return root;
}

async function writeSamplePluginFiles(root: string): Promise<void> {
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
}
