import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startWebServer } from "../src/web/server.js";
import { writeStudioPluginCheckState } from "../src/web/plugin-check-state.js";

const originalConfigDir = process.env.PRESSSHIP_CONFIG_DIR;

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PRESSSHIP_CONFIG_DIR;
  } else {
    process.env.PRESSSHIP_CONFIG_DIR = originalConfigDir;
  }
  process.env.PATH = originalPath;
});

const originalPath = process.env.PATH;

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
    process.env.PATH = `${fakeBin}${path.delimiter}${originalPath ?? ""}`;

    const server = await startWebServer({ port: 0, noOpen: true });

    try {
      const first = await addLocalPlugin(server, firstPluginRoot);
      const second = await addLocalPlugin(server, secondPluginRoot);
      const firstJob = await startPlaygroundJob(server, first.id);
      const secondJob = await startPlaygroundJob(server, second.id);

      const [firstResult, secondResult] = await Promise.all([
        waitForJobResult(server.jobs, firstJob.id),
        waitForJobResult(server.jobs, secondJob.id)
      ]);
      const ports = [firstResult.url, secondResult.url]
        .map((url: string) => Number(new URL(url).port))
        .sort((a: number, b: number) => a - b);

      expect(ports).toEqual([9500, 9501]);
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

async function startPlaygroundJob(server: { url: string; token: string }, localId: string): Promise<{ id: string }> {
  return fetch(new URL("/api/jobs", server.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Pressship-Token": server.token
    },
    body: JSON.stringify({
      type: "play",
      scope: "local",
      id: localId
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

async function writeFakeNpx(fakeBin: string): Promise<void> {
  const filePath = path.join(fakeBin, "npx");
  await writeFile(
    filePath,
    `#!/usr/bin/env node
const http = require("node:http");
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1] ?? 0);
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
