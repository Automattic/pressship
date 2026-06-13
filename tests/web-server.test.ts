import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startWebServer } from "../src/web/server.js";
import { writeStudioPluginCheckState } from "../src/web/plugin-check-state.js";

const originalConfigDir = process.env.PRESSSHIP_CONFIG_DIR;
const originalRemoteTags = process.env.PRESSSHIP_TEST_REMOTE_TAGS;
const originalSvnConflictTag = process.env.PRESSSHIP_TEST_SVN_CONFLICT_TAG;
const originalSvnStatus = process.env.PRESSSHIP_TEST_SVN_STATUS;
const originalNpxLog = process.env.PRESSSHIP_TEST_NPX_LOG;
const originalSkipMysqlPrep = process.env.PRESSSHIP_TEST_SKIP_MYSQL_PREP;

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PRESSSHIP_CONFIG_DIR;
  } else {
    process.env.PRESSSHIP_CONFIG_DIR = originalConfigDir;
  }
  if (originalRemoteTags === undefined) {
    delete process.env.PRESSSHIP_TEST_REMOTE_TAGS;
  } else {
    process.env.PRESSSHIP_TEST_REMOTE_TAGS = originalRemoteTags;
  }
  if (originalSvnConflictTag === undefined) {
    delete process.env.PRESSSHIP_TEST_SVN_CONFLICT_TAG;
  } else {
    process.env.PRESSSHIP_TEST_SVN_CONFLICT_TAG = originalSvnConflictTag;
  }
  if (originalSvnStatus === undefined) {
    delete process.env.PRESSSHIP_TEST_SVN_STATUS;
  } else {
    process.env.PRESSSHIP_TEST_SVN_STATUS = originalSvnStatus;
  }
  if (originalNpxLog === undefined) {
    delete process.env.PRESSSHIP_TEST_NPX_LOG;
  } else {
    process.env.PRESSSHIP_TEST_NPX_LOG = originalNpxLog;
  }
  if (originalSkipMysqlPrep === undefined) {
    delete process.env.PRESSSHIP_TEST_SKIP_MYSQL_PREP;
  } else {
    process.env.PRESSSHIP_TEST_SKIP_MYSQL_PREP = originalSkipMysqlPrep;
  }
  process.env.PATH = originalPath;
});

const originalPath = process.env.PATH;

describe("studio server", () => {
  it("serves the app, bootstraps state, and guards mutating APIs", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();
    await writeFile(path.join(pluginRoot, ".DS_Store"), "desktop metadata");
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
      expect(files.files.map((file: { path: string }) => file.path)).toContain(".DS_Store");

      const dsStore = await fetch(
        new URL(`/api/plugins/local/${added.id}/files/content?path=${encodeURIComponent(".DS_Store")}`, server.url)
      ).then((response) => response.json());
      expect(dsStore).toMatchObject({
        path: ".DS_Store",
        content: "desktop metadata"
      });

      await writeStudioPluginCheckState({
        pluginId: added.id,
        pluginPath: added.path,
        slug: added.slug,
        name: added.name,
        skipped: false,
        available: true,
        findings: [
          {
            severity: "error",
            code: "example.error",
            message: "Persist this line.",
            file: "example-plugin.php",
            line: 4,
            column: 1
          }
        ],
        summary: {
          error: 1,
          warning: 0,
          info: 0,
          total: 1,
          blocking: true
        },
        checkedAt: "2026-05-25T00:00:00.000Z"
      });

      const checkState = await fetch(new URL(`/api/plugins/local/${added.id}/check-state`, server.url)).then(
        (response) => response.json()
      );
      expect(checkState).toMatchObject({
        state: {
          checkedAt: "2026-05-25T00:00:00.000Z",
          findings: [
            {
              code: "example.error",
              line: 4
            }
          ],
          summary: {
            error: 1,
            total: 1
          }
        }
      });

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
      expect(saved).toMatchObject({
        path: "example-plugin.php",
        checkState: {
          findings: [],
          summary: {
            error: 0,
            total: 0,
            blocking: false
          }
        }
      });

      const updated = await fetch(contentUrl).then((response) => response.json());
      expect(updated.content).toContain("Version: 1.2.4");

      const appliedAiPatch = await fetch(new URL(`/api/plugins/local/${added.id}/ai-changes/apply`, server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({
          path: "example-plugin.php",
          status: "modified",
          beforeContent: updated.content,
          afterContent: updated.content.replace("Version: 1.2.4", "Version: 1.2.5")
        })
      }).then((response) => response.json());
      expect(appliedAiPatch).toMatchObject({
        path: "example-plugin.php",
        status: "modified",
        checkState: {
          summary: {
            total: 0
          }
        }
      });

      const afterAiPatch = await fetch(contentUrl).then((response) => response.json());
      expect(afterAiPatch.content).toContain("Version: 1.2.5");

      const createdAiPatch = await fetch(new URL(`/api/plugins/local/${added.id}/ai-changes/apply`, server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({
          path: "includes/generated.php",
          status: "created",
          afterContent: "<?php\nreturn 'generated';\n"
        })
      }).then((response) => response.json());
      expect(createdAiPatch.files.map((file: { path: string }) => file.path)).toContain("includes/generated.php");

      const staleAiPatch = await fetch(new URL(`/api/plugins/local/${added.id}/ai-changes/apply`, server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({
          path: "example-plugin.php",
          status: "modified",
          beforeContent: updated.content,
          afterContent: updated.content.replace("Version: 1.2.4", "Version: 1.2.6")
        })
      });
      expect(staleAiPatch.status).toBe(409);

      const prunedCheckState = await fetch(new URL(`/api/plugins/local/${added.id}/check-state`, server.url)).then(
        (response) => response.json()
      );
      expect(prunedCheckState.state.summary.total).toBe(0);
    } finally {
      await server.close();
    }
  });

  it("manages Studio ignore rules and marks ignored files in listings", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();
    await mkdir(path.join(pluginRoot, "includes"), { recursive: true });
    await mkdir(path.join(pluginRoot, "assets"), { recursive: true });
    await mkdir(path.join(pluginRoot, ".git", "objects"), { recursive: true });
    await mkdir(path.join(pluginRoot, ".svn"), { recursive: true });
    await mkdir(path.join(pluginRoot, "node_modules", "hidden"), { recursive: true });
    await mkdir(path.join(pluginRoot, "node_modules", "hidden", "nested"), { recursive: true });
    await mkdir(path.join(pluginRoot, "node_modules", ".git"), { recursive: true });
    await writeFile(path.join(pluginRoot, "includes", "ignored.php"), "<?php\n// ignored\n");
    await writeFile(path.join(pluginRoot, "includes", "helper.php"), "<?php\n// helper\n");
    await writeFile(path.join(pluginRoot, "assets", "demo.mp4"), "demo");
    await writeFile(path.join(pluginRoot, ".git", "objects", "ignored"), "git");
    await writeFile(path.join(pluginRoot, ".svn", "entries"), "svn");
    await writeFile(path.join(pluginRoot, "node_modules", "hidden", "ignored.php"), "<?php\n// noisy\n");
    await writeFile(path.join(pluginRoot, "node_modules", "hidden", "nested", "index.js"), "node");
    await writeFile(path.join(pluginRoot, "node_modules", ".git", "config"), "git");
    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const added = await addLocalPlugin(server, pluginRoot);
      const ignoreStateUrl = new URL(`/api/plugins/local/${added.id}/ignore-state`, server.url);
      const ignoreRulesUrl = new URL(`/api/plugins/local/${added.id}/ignore-rules`, server.url);

      const initial = await fetch(ignoreStateUrl).then((response) => response.json());
      expect(initial).toMatchObject({
        ignorePath: path.join(pluginRoot, ".pressshipignore"),
        patterns: [],
        ignoredFiles: []
      });

      const addedRule = await fetch(ignoreRulesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ pattern: "./includes/**" })
      }).then((response) => response.json());
      expect(addedRule.patterns).toEqual(["includes/**"]);
      expect(addedRule.ignoredFiles.map((file: { path: string }) => file.path)).toEqual([
        "includes/helper.php",
        "includes/ignored.php"
      ]);
      expect(await readFile(path.join(pluginRoot, ".pressshipignore"), "utf8")).toBe("includes/**\n");

      const files = await fetch(new URL(`/api/plugins/local/${added.id}/files`, server.url)).then((response) =>
        response.json()
      );
      const filesByPath = new Map(files.files.map((file: { path: string }) => [file.path, file]));
      const directoriesByPath = new Map((files.directories ?? []).map((directory: { path: string }) => [directory.path, directory]));
      expect(filesByPath.get("includes/ignored.php")).toMatchObject({
        ignored: true,
        ignoredBy: "includes/**"
      });
      expect(directoriesByPath.get("includes")).toMatchObject({
        deferred: false,
        ignored: true,
        ignoredBy: "includes/**",
        hardIgnored: false
      });
      expect(filesByPath.has(".pressshipignore")).toBe(true);
      expect(filesByPath.has("assets/demo.mp4")).toBe(true);
      expect(filesByPath.has(".git/objects/ignored")).toBe(false);
      expect(filesByPath.has("node_modules/hidden/ignored.php")).toBe(false);
      expect(directoriesByPath.has(".git")).toBe(false);
      expect(directoriesByPath.get(".svn")).toMatchObject({
        deferred: true,
        ignored: true,
        ignoredBy: "Pressship package rules",
        hardIgnored: true
      });
      expect(directoriesByPath.get("node_modules")).toMatchObject({
        deferred: true,
        ignored: true,
        ignoredBy: "Pressship package rules",
        hardIgnored: true
      });
      const nodeModules = await fetch(
        new URL(`/api/plugins/local/${added.id}/files/directory?path=node_modules`, server.url)
      ).then((response) => response.json());
      const nodeModuleDirectoriesByPath = new Map(
        (nodeModules.directories ?? []).map((directory: { path: string }) => [directory.path, directory])
      );
      const nodeModuleFilesByPath = new Map(
        (nodeModules.files ?? []).map((file: { path: string }) => [file.path, file])
      );
      expect(nodeModuleDirectoriesByPath.get("node_modules")).toMatchObject({
        deferred: false,
        ignored: true,
        ignoredBy: "Pressship package rules",
        hardIgnored: true
      });
      expect(nodeModuleDirectoriesByPath.get("node_modules/hidden")).toMatchObject({
        deferred: true,
        ignored: true,
        ignoredBy: "Pressship package rules",
        hardIgnored: true
      });
      expect(nodeModuleDirectoriesByPath.has("node_modules/.git")).toBe(false);
      expect(nodeModuleFilesByPath.has("node_modules/.git/config")).toBe(false);
      expect(nodeModuleFilesByPath.get("node_modules/hidden/ignored.php")).toBeUndefined();

      const nestedNodeModule = await fetch(
        new URL(`/api/plugins/local/${added.id}/files/directory?path=node_modules/hidden`, server.url)
      ).then((response) => response.json());
      const nestedNodeModuleDirectoriesByPath = new Map(
        (nestedNodeModule.directories ?? []).map((directory: { path: string }) => [directory.path, directory])
      );
      const nestedNodeModuleFilesByPath = new Map(
        (nestedNodeModule.files ?? []).map((file: { path: string }) => [file.path, file])
      );
      expect(nestedNodeModuleDirectoriesByPath.get("node_modules/hidden")).toMatchObject({
        deferred: false,
        ignored: true,
        ignoredBy: "Pressship package rules",
        hardIgnored: true
      });
      expect(nestedNodeModuleDirectoriesByPath.get("node_modules/hidden/nested")).toMatchObject({
        deferred: true,
        ignored: true,
        ignoredBy: "Pressship package rules",
        hardIgnored: true
      });
      expect(nestedNodeModuleFilesByPath.get("node_modules/hidden/ignored.php")).toMatchObject({
        hardIgnored: true,
        ignored: true,
        ignoredBy: "Pressship package rules"
      });

      const unsafe = await fetch(ignoreRulesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ pattern: "../secrets.php" })
      });
      expect(unsafe.status).toBe(400);

      const removedRule = await fetch(ignoreRulesUrl, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ pattern: "includes/**" })
      }).then((response) => response.json());
      expect(removedRule.patterns).toEqual([]);
      expect(removedRule.ignoredFiles).toEqual([]);
      expect(await readFile(path.join(pluginRoot, ".pressshipignore"), "utf8")).toBe("");
    } finally {
      await server.close();
    }
  });

  it("reports package size for Studio without rejecting over-limit bundles", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();
    await mkdir(path.join(pluginRoot, "assets"), { recursive: true });
    await writeFile(path.join(pluginRoot, "assets", "big-demo.bin"), randomBytes(10 * 1024 * 1024 + 256 * 1024));
    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const added = await addLocalPlugin(server, pluginRoot);
      const packageSizeUrl = new URL(`/api/plugins/local/${added.id}/package-size`, server.url);
      const initial = await fetch(packageSizeUrl).then((response) => response.json());
      expect(["calculating", "ready"]).toContain(initial.status);
      const packageSize = initial.status === "ready" ? initial : await waitForPackageSize(packageSizeUrl);
      const cached = await fetch(packageSizeUrl).then((response) => response.json());

      expect(packageSize.status).toBe("ready");
      expect(packageSize.overLimit).toBe(true);
      expect(packageSize.sizeBytes).toBeGreaterThan(packageSize.maxSizeBytes);
      expect(packageSize.fileCount).toBeGreaterThan(0);
      expect(packageSize.largestFiles[0]).toMatchObject({
        path: "assets/big-demo.bin"
      });
      expect(cached.status).toBe("ready");
      expect(cached.calculatedAt).toBe(packageSize.calculatedAt);
    } finally {
      await server.close();
    }
  });

  it("runs AI jobs against a review copy and applies patches only after approval", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();
    const fakeBin = await mkdtemp(path.join(tmpdir(), "pressship-fake-ai-bin-"));
    await writeFakeCodex(fakeBin);
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`;

    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const added = await fetch(new URL("/api/plugins/local", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ path: pluginRoot })
      }).then((response) => response.json());

      const job = await fetch(new URL("/api/jobs", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({
          type: "ai-chat",
          localId: added.id,
          assistant: "codex",
          selectedFile: "example-plugin.php",
          prompt: "Bump the plugin version to 9.9.9"
        })
      }).then((response) => response.json());

      const result = await waitForJobResult(server.jobs, job.id);
      const realContentBeforeAccept = await readFile(path.join(pluginRoot, "example-plugin.php"), "utf8");

      expect(realContentBeforeAccept).toContain("Version: 1.2.3");
      expect(result.changedFiles).toMatchObject([
        {
          path: "example-plugin.php",
          status: "modified",
          beforeContent: expect.stringContaining("Version: 1.2.3"),
          afterContent: expect.stringContaining("Version: 9.9.9")
        }
      ]);

      await fetch(new URL(`/api/plugins/local/${added.id}/ai-changes/apply`, server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({
          path: result.changedFiles[0].path,
          status: result.changedFiles[0].status,
          beforeContent: result.changedFiles[0].beforeContent,
          afterContent: result.changedFiles[0].afterContent
        })
      });

      const realContentAfterAccept = await readFile(path.join(pluginRoot, "example-plugin.php"), "utf8");
      expect(realContentAfterAccept).toContain("Version: 9.9.9");
    } finally {
      await server.close();
    }
  });

  it("runs Plugin Check against a staged copy so saved files are not mutated", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();
    const pluginFile = path.join(pluginRoot, "example-plugin.php");
    const originalContent = await readFile(pluginFile, "utf8");
    let checkedTarget = "";

    const server = await startWebServer({
      port: 0,
      noOpen: true,
      dependencies: {
        runPluginCheck: async (target) => {
          checkedTarget = target;
          await writeFile(
            path.join(target, "example-plugin.php"),
            originalContent.replace("Version: 1.2.3", "Version: 9.9.9"),
            "utf8"
          );
          return {
            skipped: false,
            available: true,
            findings: [
              {
                severity: "error",
                code: "example.mutated_target",
                message: "Checker target was mutated.",
                file: path.join(target, "example-plugin.php"),
                line: 4
              }
            ]
          };
        }
      }
    });

    try {
      const added = await addLocalPlugin(server, pluginRoot);
      const job = await fetch(new URL("/api/jobs", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({
          type: "check",
          localId: added.id
        })
      }).then((response) => response.json());

      const result = await waitForJobResult(server.jobs, job.id);

      expect(checkedTarget).not.toBe(pluginRoot);
      expect(existsSync(checkedTarget)).toBe(false);
      expect(await readFile(pluginFile, "utf8")).toBe(originalContent);
      expect(result.findings[0]).toMatchObject({
        code: "example.mutated_target",
        file: "example-plugin.php",
        line: 4
      });
    } finally {
      await server.close();
    }
  });

  it("reserves a different Playground port for each concurrent plugin start", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const firstPluginRoot = await samplePlugin();
    const secondPluginRoot = await samplePlugin({
      pluginName: "Second Plugin",
      textDomain: "second-plugin",
      fileName: "second-plugin.php"
    });
    const fakeBin = await mkdtemp(path.join(tmpdir(), "pressship-fake-playground-bin-"));
    await writeFakeNpx(fakeBin);
    const npxLog = path.join(fakeBin, "fake-npx.log");
    process.env.PRESSSHIP_TEST_NPX_LOG = npxLog;
    process.env.PRESSSHIP_TEST_SKIP_MYSQL_PREP = "1";
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`;

    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const first = await addLocalPlugin(server, firstPluginRoot);
      const second = await addLocalPlugin(server, secondPluginRoot);
      const unsupportedJob = await startPlaygroundJob(server, first.id, "3.5.1");
      const unsupportedError = await waitForJobError(server.jobs, unsupportedJob.id);
      expect(unsupportedError).toContain("WordPress Playground cannot currently run WordPress 3.5.1");

      const firstJob = await startPlaygroundJob(server, first.id, "4.7");
      const secondJob = await startPlaygroundJob(server, second.id);

      const [firstResult, secondResult] = await Promise.all([
        waitForJobResult(server.jobs, firstJob.id),
        waitForJobResult(server.jobs, secondJob.id)
      ]);
      const ports = [firstResult.url, secondResult.url]
        .map((url: string) => Number(new URL(url).port))
        .sort((a: number, b: number) => a - b);

      expect(ports).toEqual([9500, 9501]);
      expect(firstResult.plan.wpVersion).toBe("4.7");
      expect(firstResult.plan.phpVersion).toBe("7.4");
      expect(firstResult.plan.database).toEqual({ mode: "sqlite" });
      expect(secondResult.plan.wpVersion).toBeUndefined();
      expect(secondResult.plan.phpVersion).toBeUndefined();
      expect(secondResult.plan.database).toEqual({ mode: "sqlite" });

      const recorded = (await readFile(npxLog, "utf8")).trim().split("\n");
      const supportedLine = recorded.find((line) => line.includes("--wp=4.7"));
      expect(supportedLine).toContain("start");
      expect(supportedLine).toContain("--php=7.4");
      expect(recorded.filter((line) => line.includes("--wp="))).toHaveLength(1);
      expect(recorded.filter((line) => line.includes("--php="))).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  it("lists, creates, switches, and deletes SVN release tags for a local working copy", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    process.env.PRESSSHIP_TEST_REMOTE_TAGS = "1.0.0";

    const fakeBin = await mkdtemp(path.join(tmpdir(), "pressship-fake-svn-bin-"));
    await writeFakeSvn(fakeBin);
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`;

    const svnRoot = await sampleSvnWorkingCopy({
      slug: "release-plugin",
      committedTags: ["1.0.0"],
      uncommittedTags: ["1.0.1"]
    });

    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const added = await fetch(new URL("/api/plugins/local", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ path: svnRoot })
      }).then((response) => response.json());

      expect(added).toMatchObject({ slug: "release-plugin" });

      const initial = await fetch(new URL(`/api/plugins/local/${added.id}/svn-tags`, server.url)).then(
        (response) => response.json()
      );
      expect(initial.source).toBe("local");
      expect(initial.tags.map((tag: { name: string }) => tag.name)).toEqual(
        expect.arrayContaining(["1.0.0", "1.0.1"])
      );
      expect(initial.tags.find((tag: { name: string }) => tag.name === "1.0.0")).toMatchObject({
        isUncommitted: false
      });
      expect(initial.tags.find((tag: { name: string }) => tag.name === "1.0.1")).toMatchObject({
        isUncommitted: true
      });

      const created = await fetch(new URL(`/api/plugins/local/${added.id}/svn-tags`, server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ name: "1.0.2" })
      });
      expect(created.status).toBe(201);
      const createdBody = await created.json();
      expect(createdBody.tag).toMatchObject({ name: "1.0.2", isUncommitted: true });
      expect(existsSync(path.join(svnRoot, "tags/1.0.2"))).toBe(true);

      const reserved = await fetch(new URL(`/api/plugins/local/${added.id}/svn-tags`, server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ name: "trunk" })
      });
      expect(reserved.status).toBe(400);

      const deleteCommitted = await fetch(
        new URL(`/api/plugins/local/${added.id}/svn-tags/1.0.0`, server.url),
        {
          method: "DELETE",
          headers: { "X-Pressship-Token": server.token }
        }
      );
      expect(deleteCommitted.status).toBe(409);

      const deleteUncommitted = await fetch(
        new URL(`/api/plugins/local/${added.id}/svn-tags/1.0.1`, server.url),
        {
          method: "DELETE",
          headers: { "X-Pressship-Token": server.token }
        }
      );
      expect(deleteUncommitted.status).toBe(200);
      const deleteBody = await deleteUncommitted.json();
      expect(deleteBody.deleted).toBe("1.0.1");
      expect(existsSync(path.join(svnRoot, "tags/1.0.1"))).toBe(false);

      await writeStudioPluginCheckState({
        pluginId: added.id,
        pluginPath: added.path,
        slug: added.slug,
        name: added.name,
        skipped: false,
        available: true,
        findings: [
          {
            severity: "error",
            message: "Stale after tag switch.",
            code: "example.switch",
            file: "release-plugin.php",
            line: 4
          }
        ],
        summary: {
          error: 1,
          warning: 0,
          info: 0,
          total: 1,
          blocking: true
        },
        checkedAt: "2026-05-25T00:10:00.000Z"
      });

      const switchLog = path.join(svnRoot, "fake-svn-switch.log");
      process.env.PRESSSHIP_TEST_SVN_LOG = switchLog;

      try {
        const switchJob = await fetch(
          new URL(`/api/plugins/local/${added.id}/svn-tags/1.0.0/switch`, server.url),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Pressship-Token": server.token
            },
            body: JSON.stringify({})
          }
        ).then((response) => response.json());
        const result = await waitForJobResult(server.jobs, switchJob.id);
        expect(result).toMatchObject({
          ref: "1.0.0",
          slug: "release-plugin",
          workingCopy: path.join(svnRoot, "trunk"),
          checkState: null
        });
        const clearedCheckState = await fetch(new URL(`/api/plugins/local/${added.id}/check-state`, server.url)).then(
          (response) => response.json()
        );
        expect(clearedCheckState.state).toBeUndefined();

        const recorded = (await readFile(switchLog, "utf8")).trim().split("\n");
        const switchCall = recorded.find((line) => line.startsWith("switch\t"));
        expect(switchCall).toBeDefined();
        // The svn switch invocation must point at the plugin's working copy
        // (svnRoot/trunk), not at the tags/<name> mirror.
        expect(switchCall).toContain(path.join(svnRoot, "trunk"));
        expect(switchCall).toContain("https://plugins.svn.wordpress.org/release-plugin/tags/1.0.0");

        const switchedFile = await readFile(path.join(svnRoot, "trunk", "release-plugin.php"), "utf8");
        expect(switchedFile).toContain("Version: 1.0.0");

        const switchedContent = await fetch(
          new URL(`/api/plugins/local/${added.id}/files/content?path=release-plugin.php`, server.url)
        ).then((response) => response.json());
        expect(switchedContent.content).toContain("Version: 1.0.0");
      } finally {
        delete process.env.PRESSSHIP_TEST_SVN_LOG;
      }
    } finally {
      await server.close();
    }
  });

  it("reverts a dirty or conflicted working copy before switching SVN tags", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    process.env.PRESSSHIP_TEST_REMOTE_TAGS = "1.0.0";
    process.env.PRESSSHIP_TEST_SVN_STATUS = "C trunk/dirty-plugin.php\n";

    const fakeBin = await mkdtemp(path.join(tmpdir(), "pressship-fake-svn-bin-"));
    await writeFakeSvn(fakeBin);
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`;

    const dirtyRoot = await sampleSvnWorkingCopy({
      slug: "dirty-plugin",
      pluginName: "Dirty Plugin",
      committedTags: ["1.0.0"]
    });
    const overrideRoot = await sampleSvnWorkingCopy({
      slug: "override-plugin",
      pluginName: "Override Plugin",
      committedTags: ["1.0.0"]
    });
    const switchLog = path.join(dirtyRoot, "fake-svn-switch-conflict.log");
    process.env.PRESSSHIP_TEST_SVN_LOG = switchLog;

    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const dirtyPlugin = await addLocalPlugin(server, path.join(dirtyRoot, "trunk"));
      const overridePlugin = await addLocalPlugin(server, path.join(overrideRoot, "trunk"));

      const dirtyJob = await createSvnSwitchJob(server, dirtyPlugin.id, "1.0.0");
      const dirtyResult = await waitForJobResult(server.jobs, dirtyJob.id);
      expect(dirtyResult).toMatchObject({ ref: "1.0.0", slug: "dirty-plugin" });
      expect(await readFile(path.join(dirtyRoot, "trunk", "dirty-plugin.php"), "utf8")).toContain("Version: 1.0.0");

      const overrideJob = await createSvnSwitchJob(server, overridePlugin.id, "1.0.0", "override");
      const overrideResult = await waitForJobResult(server.jobs, overrideJob.id);
      expect(overrideResult).toMatchObject({ ref: "1.0.0", slug: "override-plugin" });
      expect(await readFile(path.join(overrideRoot, "trunk", "override-plugin.php"), "utf8")).toContain(
        "Version: 1.0.0"
      );

      const recorded = (await readFile(switchLog, "utf8")).trim().split("\n");
      const dirtyRevertIndex = recorded.findIndex((line) =>
        line.startsWith("revert\t--recursive") && line.includes(path.join(dirtyRoot, "trunk"))
      );
      const dirtySwitchIndex = recorded.findIndex((line) =>
        line.startsWith("switch\t") && line.includes("https://plugins.svn.wordpress.org/dirty-plugin/tags/1.0.0")
      );
      expect(dirtyRevertIndex).toBeGreaterThanOrEqual(0);
      expect(dirtySwitchIndex).toBeGreaterThan(dirtyRevertIndex);
      expect(recorded.some((line) => line.startsWith("switch\t") && line.includes("--force\t--accept\ttheirs-conflict"))).toBe(
        true
      );
    } finally {
      delete process.env.PRESSSHIP_TEST_SVN_LOG;
      await server.close();
    }
  });

  it("sets plugin versions and clears stale Plugin Check state", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();
    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const added = await fetch(new URL("/api/plugins/local", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ path: pluginRoot })
      }).then((response) => response.json());

      await writeStudioPluginCheckState({
        pluginId: added.id,
        pluginPath: pluginRoot,
        slug: "example-plugin",
        name: "Example Plugin",
        skipped: false,
        available: true,
        findings: [
          {
            severity: "error",
            message: "Version-related finding",
            code: "example.version",
            file: "example-plugin.php",
            line: 4
          }
        ],
        summary: {
          error: 1,
          warning: 0,
          info: 0,
          total: 1,
          blocking: true
        },
        checkedAt: "2026-05-25T00:00:00.000Z"
      });

      const updated = await fetch(new URL(`/api/plugins/local/${added.id}/version`, server.url), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ version: "9.8.7" })
      }).then((response) => response.json());

      expect(updated.localVersion).toBe("9.8.7");
      expect(updated.readmeStableTag).toBe("9.8.7");
      expect(updated.checkState).toBeNull();
      const clearedAfterSet = await fetch(new URL(`/api/plugins/local/${added.id}/check-state`, server.url)).then(
        (response) => response.json()
      );
      expect(clearedAfterSet.state).toBeUndefined();

      const mainFile = await readFile(path.join(pluginRoot, "example-plugin.php"), "utf8");
      expect(mainFile).toContain("Version: 9.8.7");

      await writeStudioPluginCheckState({
        pluginId: added.id,
        pluginPath: pluginRoot,
        slug: "example-plugin",
        name: "Example Plugin",
        skipped: false,
        available: true,
        findings: [
          {
            severity: "error",
            message: "Another version-related finding",
            code: "example.version.bump",
            file: "readme.txt",
            line: 4
          }
        ],
        summary: {
          error: 1,
          warning: 0,
          info: 0,
          total: 1,
          blocking: true
        },
        checkedAt: "2026-05-25T00:05:00.000Z"
      });

      const bumped = await fetch(new URL(`/api/plugins/local/${added.id}/bump-version`, server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ bump: "patch" })
      }).then((response) => response.json());
      expect(bumped.localVersion).toBe("9.8.8");
      expect(bumped.checkState).toBeNull();
      const clearedAfterBump = await fetch(new URL(`/api/plugins/local/${added.id}/check-state`, server.url)).then(
        (response) => response.json()
      );
      expect(clearedAfterBump.state).toBeUndefined();

      const rejected = await fetch(new URL(`/api/plugins/local/${added.id}/version`, server.url), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ version: "not a version" })
      });
      expect(rejected.status).toBe(400);
    } finally {
      await server.close();
    }
  });

  it("returns a release board snapshot across local plugins", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-config-"));
    const pluginRoot = await samplePlugin();
    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const added = await fetch(new URL("/api/plugins/local", server.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pressship-Token": server.token
        },
        body: JSON.stringify({ path: pluginRoot })
      }).then((response) => response.json());

      const board = await fetch(new URL("/api/release-board", server.url)).then((response) => response.json());
      expect(board.plugins).toHaveLength(1);
      expect(board.plugins[0]).toMatchObject({
        id: added.id,
        slug: "example-plugin",
        localVersion: "1.2.3",
        readmeStableTag: "1.2.3"
      });
      expect(Array.isArray(board.plugins[0].statuses)).toBe(true);
    } finally {
      await server.close();
    }
  });
});

async function samplePlugin(
  options: { pluginName?: string; textDomain?: string; fileName?: string } = {}
): Promise<string> {
  const pluginName = options.pluginName ?? "Example Plugin";
  const textDomain = options.textDomain ?? "example-plugin";
  const fileName = options.fileName ?? "example-plugin.php";
  const root = await mkdtemp(path.join(tmpdir(), "pressship-studio-plugin-"));
  await mkdir(root, { recursive: true });
  await writeFile(
    path.join(root, fileName),
    `<?php
/**
 * Plugin Name: ${pluginName}
 * Version: 1.2.3
 * Text Domain: ${textDomain}
 */
`
  );
  await writeFile(
    path.join(root, "readme.txt"),
    `=== ${pluginName} ===
Contributors: example
Tags: example
Stable tag: 1.2.3

== Description ==
Example.
`
  );
  return root;
}

async function addLocalPlugin(server: { url: string; token: string }, pluginRoot: string): Promise<{ id: string }> {
  return fetch(new URL("/api/plugins/local", server.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pressship-Token": server.token
    },
    body: JSON.stringify({ path: pluginRoot })
  }).then((response) => response.json()) as Promise<{ id: string }>;
}

async function waitForPackageSize(url: URL): Promise<any> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const result = await fetch(url).then((response) => response.json());
    if (result.status === "ready" || result.status === "error") {
      return result;
    }
  }
  throw new Error("Timed out waiting for package size.");
}

async function startPlaygroundJob(
  server: { url: string; token: string },
  localId: string,
  wpVersion?: string
): Promise<{ id: string }> {
  return fetch(new URL("/api/jobs", server.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pressship-Token": server.token
    },
    body: JSON.stringify({
      type: "play",
      scope: "local",
      id: localId,
      ...(wpVersion ? { wpVersion } : {})
    })
  }).then((response) => response.json()) as Promise<{ id: string }>;
}

async function createSvnSwitchJob(
  server: { url: string; token: string },
  localId: string,
  tag: string,
  conflictResolution?: "override" | "revert"
): Promise<{ id: string }> {
  return fetch(new URL("/api/jobs", server.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pressship-Token": server.token
    },
    body: JSON.stringify({
      type: "svn-switch",
      localId,
      tag,
      ...(conflictResolution ? { conflictResolution } : {})
    })
  }).then((response) => response.json()) as Promise<{ id: string }>;
}

async function writeFakeCodex(fakeBin: string): Promise<void> {
  const filePath = path.join(fakeBin, "codex");
  await writeFile(
    filePath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
if (args.join(" ") === "--version") {
  console.log("codex 0.133.0");
  process.exit(0);
}
if (args.join(" ") === "login status") {
  console.log("Logged in as test");
  process.exit(0);
}
const prompt = process.argv[process.argv.length - 1] || "";
const pluginPath = prompt.match(/Plugin path: (.+)/)?.[1]?.trim();
const selectedFile = prompt.match(/Current editor file: (.+)/)?.[1]?.trim() || "example-plugin.php";
if (!pluginPath) {
  process.exit(2);
}
const filePath = path.join(pluginPath, selectedFile);
const content = fs.readFileSync(filePath, "utf8");
fs.writeFileSync(filePath, content.replace("Version: 1.2.3", "Version: 9.9.9"));
console.log(JSON.stringify({ type: "agent_message_delta", delta: "Prepared a version patch." }));
`,
    "utf8"
  );
  await chmod(filePath, 0o755);
}

async function sampleSvnWorkingCopy(
  options: {
    slug?: string;
    pluginName?: string;
    fileName?: string;
    version?: string;
    committedTags?: string[];
    uncommittedTags?: string[];
  } = {}
): Promise<string> {
  const slug = options.slug ?? "release-plugin";
  const pluginName = options.pluginName ?? "Release Plugin";
  const fileName = options.fileName ?? `${slug}.php`;
  const version = options.version ?? "1.0.1";
  const committedTags = options.committedTags ?? [];
  const uncommittedTags = options.uncommittedTags ?? [];

  const svnRoot = await mkdtemp(path.join(tmpdir(), "pressship-svn-working-copy-"));
  await mkdir(path.join(svnRoot, ".svn"), { recursive: true });
  await mkdir(path.join(svnRoot, "trunk"), { recursive: true });
  await writeFile(
    path.join(svnRoot, "trunk", fileName),
    `<?php
/**
 * Plugin Name: ${pluginName}
 * Version: ${version}
 * Text Domain: ${slug}
 */
`
  );
  await writeFile(
    path.join(svnRoot, "trunk", "readme.txt"),
    `=== ${pluginName} ===
Contributors: tester
Tags: example
Stable tag: ${version}

== Description ==
Release plugin sample.
`
  );

  for (const tagName of [...committedTags, ...uncommittedTags]) {
    const tagDir = path.join(svnRoot, "tags", tagName);
    await mkdir(tagDir, { recursive: true });
    await writeFile(
      path.join(tagDir, fileName),
      `<?php
/**
 * Plugin Name: ${pluginName}
 * Version: ${tagName}
 * Text Domain: ${slug}
 */
`
    );
  }

  return svnRoot;
}

async function writeFakeSvn(fakeBin: string): Promise<void> {
  const filePath = path.join(fakeBin, "svn");
  await writeFile(
    filePath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const remoteTags = (process.env.PRESSSHIP_TEST_REMOTE_TAGS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const conflictTag = process.env.PRESSSHIP_TEST_SVN_CONFLICT_TAG || "";
const statusOutput = process.env.PRESSSHIP_TEST_SVN_STATUS || "";
const cwd = process.cwd();
const [cmd, ...rest] = argv;
const valueOptions = new Set(["--accept", "--depth"]);

const logPath = process.env.PRESSSHIP_TEST_SVN_LOG;
if (logPath) {
  try {
    fs.appendFileSync(logPath, argv.join("\\t") + "\\n");
  } catch {}
}

function exit(code, stdout, stderr) {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.exit(code);
}

function positionalArgs(tokens) {
  const values = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith("--")) {
      if (valueOptions.has(token)) index += 1;
      continue;
    }
    values.push(token);
  }
  return values;
}

if (cmd === "--version") {
  exit(0, "svn fake 0.0.0\\n");
}

if (cmd === "info") {
  const target = rest.filter((token) => !token.startsWith("--"))[0];
  if (!target) exit(1);
  if (target.startsWith("http://") || target.startsWith("https://")) {
    const tagMatch = target.match(/\\/tags\\/([^/]+)\\/?$/);
    if (tagMatch) {
      if (remoteTags.includes(tagMatch[1])) {
        exit(0, "URL: " + target + "\\nRevision: 1\\n");
      }
      exit(1, "", "svn: E170000: URL " + target + " not found\\n");
    }
    exit(0, "URL: " + target + "\\nRevision: 1\\n");
  }
  exit(0, "URL: https://plugins.svn.wordpress.org/release-plugin/trunk\\nRevision: 1\\nLast Changed Author: tester\\n");
}

if (cmd === "list") {
  const output = remoteTags.length ? remoteTags.map((tag) => tag + "/").join("\\n") + "\\n" : "";
  exit(0, output);
}

if (cmd === "copy") {
  const positional = positionalArgs(rest);
  const [source, dest] = positional;
  if (!source || !dest) exit(1, "", "missing args\\n");
  const sourcePath = path.resolve(cwd, source);
  const destPath = path.resolve(cwd, dest);
  if (!fs.existsSync(sourcePath)) exit(1, "", "source missing\\n");
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.cpSync(sourcePath, destPath, { recursive: true });
  exit(0, "A " + dest + "\\n");
}

if (cmd === "switch") {
  const positional = positionalArgs(rest);
  const [url, target = "."] = positional;
  const tagMatch = url?.match(/\\/tags\\/([^/]+)\\/?$/);
  const targetPath = path.resolve(cwd, target);
  const revertedMarker = path.join(cwd, ".pressship-test-reverted");
  if (tagMatch) {
    const acceptsIncoming = rest.includes("--accept") && rest.includes("theirs-conflict");
    if (conflictTag === tagMatch[1] && !acceptsIncoming && !fs.existsSync(revertedMarker)) {
      exit(1, "C " + targetPath + "\\nSummary of conflicts:\\n  Text conflicts: 1\\n");
    }
    const sourcePath = path.resolve(cwd, "tags", tagMatch[1]);
    if (fs.existsSync(sourcePath) && sourcePath !== targetPath) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    }
  }
  exit(0, "At revision 1.\\n");
}

if (cmd === "revert") {
  fs.writeFileSync(path.join(cwd, ".pressship-test-reverted"), "1");
  exit(0, "");
}

if (cmd === "status") {
  exit(0, statusOutput);
}

if (cmd === "resolve" || cmd === "update" || cmd === "delete" || cmd === "add" || cmd === "commit" || cmd === "propset" || cmd === "checkout") {
  exit(0, "");
}

exit(0, "");
`,
    "utf8"
  );
  await chmod(filePath, 0o755);
}

async function writeFakeNpx(fakeBin: string): Promise<void> {
  const filePath = path.join(fakeBin, "npx");
  await writeFile(
    filePath,
    `#!/usr/bin/env node
const http = require("node:http");
const fs = require("node:fs");
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1] ?? 0);
if (process.env.PRESSSHIP_TEST_NPX_LOG) {
  fs.appendFileSync(process.env.PRESSSHIP_TEST_NPX_LOG, process.argv.slice(2).join("\\t") + "\\n");
}
if (!port) {
  process.exit(2);
}
setTimeout(() => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ready");
  });
  server.listen(port, "127.0.0.1");
}, 150);
process.on("SIGTERM", () => process.exit(0));
setInterval(() => undefined, 1000);
`,
    "utf8"
  );
  await chmod(filePath, 0o755);
}

async function waitForJobResult(
  jobs: { get(id: string): { status: string; events: Array<{ type: string; data: unknown }> } | undefined },
  id: string
): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const job = jobs.get(id);
    const result = job?.events.find((event) => event.type === "result")?.data;
    if (result) {
      return result;
    }
    if (job?.status === "failed") {
      throw new Error(String(job.events.find((event) => event.type === "error")?.data ?? "AI job failed."));
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for AI job result.");
}

async function waitForJobError(
  jobs: { get(id: string): { status: string; events: Array<{ type: string; data: unknown }> } | undefined },
  id: string
): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const job = jobs.get(id);
    const error = job?.events.find((event) => event.type === "error")?.data;
    if (error) {
      return typeof error === "string" ? error : JSON.stringify(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for job error.");
}
