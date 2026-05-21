import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
});

async function samplePlugin(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pressship-plugin-"));
  await mkdir(root, { recursive: true });
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
