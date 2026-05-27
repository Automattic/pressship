import { describe, expect, it } from "vitest";
import type { CommandResult } from "harness-app-sdk";
import {
  createAiAssistantEnvironment,
  createAiAssistantPrompt,
  detectAiAssistance,
  describeAiAssistantRun,
  type AiCommandRunner
} from "../src/web/ai-assistance.js";
import { defaultWebSettings, webSettingsSchema } from "../src/web/settings.js";

describe("Studio AI assistance detection", () => {
  it("detects ready, unauthenticated, and installed-only Harness providers", async () => {
    const result = await detectAiAssistance(fakeRunner({
      "codex --version": { exitCode: 0, stdout: "codex 0.133.0", stderr: "" },
      "codex login status": { exitCode: 1, stdout: "", stderr: "not logged in" },
      "claude --version": { exitCode: 0, stdout: "2.1.85 (Claude Code)", stderr: "" },
      "claude auth status": {
        exitCode: 0,
        stdout: JSON.stringify({ loggedIn: true }, null, 2),
        stderr: ""
      },
      "copilot --version": { exitCode: 0, stdout: "copilot version 1.2.3", stderr: "" },
      "gemini --version": { exitCode: 0, stdout: "0.2.0", stderr: "" },
      "npx --version": { exitCode: 0, stdout: "11.0.0", stderr: "" }
    }));

    expect(result.providers).toMatchObject([
      {
        id: "codex",
        installed: true,
        authenticated: false,
        status: "not_authenticated",
        checkedCommand: "codex --version"
      },
      {
        id: "claude",
        installed: true,
        authenticated: true,
        status: "ready",
        detail: "2.1.85 (Claude Code). Signed in.",
        checkedCommand: "claude --version"
      },
      {
        id: "copilot",
        installed: true,
        status: "installed",
        checkedCommand: "copilot --version"
      },
      {
        id: "gemini",
        installed: true,
        status: "installed",
        checkedCommand: "gemini --version"
      },
      {
        id: "wp-studio",
        installed: true,
        status: "installed",
        checkedCommand: "npx --version"
      }
    ]);
  });

  it("marks missing assistant commands as not installed", async () => {
    const result = await detectAiAssistance(missingRunner);

    expect(result.providers.map((provider) => provider.status)).toEqual([
      "not_installed",
      "not_installed",
      "not_installed",
      "not_installed",
      "not_installed"
    ]);
  });

  it("persists the selected AI assistant in Studio settings", () => {
    expect(defaultWebSettings.aiAssistant).toBe("none");
    expect(
      webSettingsSchema.parse({
        ...defaultWebSettings,
        aiAssistant: "gemini"
      }).aiAssistant
    ).toBe("gemini");
    expect(
      webSettingsSchema.parse({
        ...defaultWebSettings,
        aiAssistant: "wp-studio"
      }).aiAssistant
    ).toBe("wp-studio");
  });

  it("removes TERM from background assistant environments", () => {
    expect(createAiAssistantEnvironment({ PATH: "/bin", TERM: "dumb" })).toEqual({
      PATH: "/bin",
      NO_COLOR: "1",
      FORCE_COLOR: "0"
    });
  });

  it("redacts prompts in Harness run descriptions", () => {
    expect(
      describeAiAssistantRun({
        command: "codex",
        args: ["exec", "--json", "--skip-git-repo-check", "--sandbox", "workspace-write", "Fix the plugin"]
      })
    ).toBe("codex exec --json --skip-git-repo-check --sandbox workspace-write <prompt>");
    expect(
      describeAiAssistantRun({
        command: "gemini",
        args: ["-p", "Fix the plugin", "--output-format", "stream-json"]
      })
    ).toBe("gemini -p <prompt> --output-format stream-json");
    expect(
      describeAiAssistantRun({
        command: "npx",
        args: ["wp-studio@latest", "code", "Fix the plugin", "--json"]
      })
    ).toBe("npx wp-studio@latest code <prompt> --json");
  });

  it("includes plugin context in Studio AI prompts", () => {
    const prompt = createAiAssistantPrompt({
      pluginPath: "/tmp/example-plugin",
      selectedFile: "includes/admin.php",
      userPrompt: "Add validation",
      pluginCheck: {
        checkedAt: "2026-05-25T00:00:00.000Z",
        skipped: false,
        available: true,
        summary: {
          error: 1,
          warning: 2,
          info: 0,
          total: 3,
          blocking: true
        },
        findings: [
          {
            severity: "error",
            code: "WordPress.Security.NonceVerification.Missing",
            message: "Processing form data without nonce verification.",
            file: "includes/admin.php",
            line: 42,
            column: 7
          },
          {
            severity: "warning",
            code: "example.warning",
            message: "This warning should not be expanded as a current error.",
            file: "readme.txt",
            line: 1
          }
        ]
      }
    });

    expect(prompt).toContain("Plugin path: /tmp/example-plugin");
    expect(prompt).toContain("Current editor file: includes/admin.php");
    expect(prompt).toContain("Work in this plugin folder.");
    expect(prompt).toContain("reviewable patches");
    expect(prompt).toContain("Current Plugin Check context:");
    expect(prompt).toContain("Summary: 1 errors, 2 warnings, 0 info; blocking=yes.");
    expect(prompt).toContain(
      "- includes/admin.php:42:7 [WordPress.Security.NonceVerification.Missing]: Processing form data without nonce verification."
    );
    expect(prompt).not.toContain("This warning should not be expanded");
    expect(prompt).toContain("Add validation");
  });
});

function fakeRunner(responses: Record<string, Partial<CommandResult>>): AiCommandRunner {
  return async (command, args, options) => {
    const response = responses[[command, ...args].join(" ")];
    if (!response) {
      return missingCommand(command, args, options.cwd);
    }

    return {
      command,
      args,
      cwd: options.cwd,
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
      timedOut: false,
      aborted: false,
      ...response
    };
  };
}

const missingRunner: AiCommandRunner = async (command, args, options) => {
  return missingCommand(command, args, options.cwd);
};

function missingCommand(command: string, args: string[], cwd: string): CommandResult {
  return {
    command,
    args,
    cwd,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: 1,
    timedOut: false,
    aborted: false,
    error: Object.assign(new Error("missing command"), { code: "ENOENT" })
  };
}
