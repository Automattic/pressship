import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSavedSvnPassword, getSvnPasswordUrl, saveSvnPassword } from "../src/svn/credentials.js";
import { getPluginSvnUrl, parseSvnInfo, resolveCheckoutPath, resolveSvnGetAction } from "../src/svn/get.js";
import { assertReleaseVersionIsNew, createReleaseCommandPlan } from "../src/svn/release.js";
import { formatSubversionInstallInstructions, getSubversionInstallPlan } from "../src/svn/subversion.js";
import { getSvnCredentialsPath } from "../src/utils/paths.js";

const originalConfigDir = process.env.PRESSSHIP_CONFIG_DIR;

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PRESSSHIP_CONFIG_DIR;
  } else {
    process.env.PRESSSHIP_CONFIG_DIR = originalConfigDir;
  }
});

describe("SVN release planning", () => {
  it("builds the expected command plan", () => {
    const plan = createReleaseCommandPlan(
      "example-plugin",
      "/tmp/example-plugin-svn",
      "1.2.3",
      "Release example-plugin 1.2.3",
      "WpUser"
    );

    expect(plan).toEqual([
      {
        command: "svn",
        args: [
          "checkout",
          "https://plugins.svn.wordpress.org/example-plugin",
          "/tmp/example-plugin-svn"
        ]
      },
      { command: "svn", args: ["add", "--force", "."], cwd: "/tmp/example-plugin-svn" },
      { command: "svn", args: ["copy", "trunk", "tags/1.2.3"], cwd: "/tmp/example-plugin-svn" },
      { command: "svn", args: ["update"], cwd: "/tmp/example-plugin-svn" },
      { command: "svn", args: ["status"], cwd: "/tmp/example-plugin-svn" },
      {
        command: "svn",
        args: [
          "commit",
          "-m",
          "Release example-plugin 1.2.3",
          "--no-auth-cache",
          "--non-interactive",
          "--username",
          "WpUser",
          "--password",
          "<saved-svn-password>"
        ],
        cwd: "/tmp/example-plugin-svn"
      }
    ]);
  });

  it("builds the WordPress.org SVN password URL for a username", () => {
    expect(getSvnPasswordUrl("fatihkadirakin")).toBe(
      "https://profiles.wordpress.org/fatihkadirakin/profile/edit/group/3/?screen=svn-password"
    );
  });

  it("saves SVN passwords in the Pressship config directory", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-config-"));

    await saveSvnPassword("WpUser", "generated-password");

    expect(await getSavedSvnPassword("WpUser")).toBe("generated-password");
    await expect(readFile(getSvnCredentialsPath(), "utf8")).resolves.toContain("generated-password");
  });

  it("rejects releases when the SVN tag already exists", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pressship-svn-release-"));
    const svnDir = path.join(root, "example-plugin");
    await mkdir(path.join(svnDir, "tags", "1.2.3"), { recursive: true });

    await expect(assertReleaseVersionIsNew("1.2.3", svnDir)).rejects.toThrow("No version change detected");
  });

  it("allows releases when the SVN tag does not exist yet", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pressship-svn-release-"));
    const svnDir = path.join(root, "example-plugin");
    await mkdir(path.join(svnDir, "tags", "1.2.2"), { recursive: true });

    await expect(assertReleaseVersionIsNew("1.2.3", svnDir)).resolves.toBeUndefined();
  });
});

describe("SVN checkout planning", () => {
  it("resolves default checkout paths and plugin SVN URLs", () => {
    expect(resolveCheckoutPath("example-plugin", undefined)).toBe(path.resolve("example-plugin"));
    expect(resolveCheckoutPath("example-plugin", "./vendor/example-plugin")).toBe(
      path.resolve("vendor/example-plugin")
    );
    expect(getPluginSvnUrl("example-plugin")).toBe("https://plugins.svn.wordpress.org/example-plugin");
  });

  it("detects checkout, update, and invalid target directories", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pressship-svn-get-"));
    const missing = path.join(root, "missing");
    const workingCopy = path.join(root, "working-copy");
    const occupied = path.join(root, "occupied");

    await mkdir(path.join(workingCopy, ".svn"), { recursive: true });
    await mkdir(occupied);
    await writeFile(path.join(occupied, "file.txt"), "");

    await expect(resolveSvnGetAction(missing)).resolves.toBe("checkout");
    await expect(resolveSvnGetAction(workingCopy)).resolves.toBe("update");
    await expect(resolveSvnGetAction(occupied)).rejects.toThrow("not an SVN working copy");
  });

  it("parses svn info output", () => {
    expect(
      parseSvnInfo(`Path: example-plugin
Working Copy Root Path: /tmp/example-plugin
URL: https://plugins.svn.wordpress.org/example-plugin
Relative URL: ^/
Repository Root: https://plugins.svn.wordpress.org/example-plugin
Repository UUID: example-uuid
Revision: 123
Node Kind: directory
Schedule: normal
Last Changed Author: WpUser
Last Changed Rev: 120
Last Changed Date: 2026-05-21 12:00:00 +0000 (Thu, 21 May 2026)
`)
    ).toEqual({
      workingCopyRoot: "/tmp/example-plugin",
      url: "https://plugins.svn.wordpress.org/example-plugin",
      relativeUrl: "^/",
      repositoryRoot: "https://plugins.svn.wordpress.org/example-plugin",
      repositoryUuid: "example-uuid",
      revision: "123",
      nodeKind: "directory",
      schedule: "normal",
      lastChangedAuthor: "WpUser",
      lastChangedRevision: "120",
      lastChangedDate: "2026-05-21 12:00:00 +0000 (Thu, 21 May 2026)"
    });
  });
});

describe("Subversion install planning", () => {
  it("uses Homebrew on macOS when it is available", () => {
    expect(getSubversionInstallPlan("darwin", ["brew"])).toEqual({
      platform: "darwin",
      manager: "Homebrew",
      commands: [{ command: "brew", args: ["install", "subversion"] }],
      instructions: ["Install Subversion with Homebrew: brew install subversion"]
    });
  });

  it("uses apt on Debian and Ubuntu Linux", () => {
    expect(getSubversionInstallPlan("linux", ["apt-get", "sudo"])).toEqual({
      platform: "linux",
      manager: "apt",
      commands: [
        { command: "sudo", args: ["apt-get", "update"] },
        { command: "sudo", args: ["apt-get", "install", "-y", "subversion"] }
      ],
      instructions: ["Install Subversion with apt: sudo apt-get update && sudo apt-get install -y subversion"]
    });
  });

  it("uses winget on Windows when it is available", () => {
    expect(getSubversionInstallPlan("win32", ["winget"])).toEqual({
      platform: "win32",
      manager: "winget",
      commands: [{ command: "winget", args: ["install", "--id", "Apache.Subversion", "-e"] }],
      instructions: ["Install Subversion with winget: winget install --id Apache.Subversion -e"]
    });
  });

  it("formats manual instructions when no package manager is detected", () => {
    const plan = getSubversionInstallPlan("linux", []);

    expect(plan.commands).toEqual([]);
    expect(formatSubversionInstallInstructions(plan)).toContain("Subversion (`svn`) is required");
    expect(formatSubversionInstallInstructions(plan)).toContain("system package manager");
  });
});
