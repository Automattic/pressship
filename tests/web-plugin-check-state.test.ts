import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readStudioPluginCheckState,
  removeStudioPluginCheckFindingsForFiles,
  writeStudioPluginCheckState
} from "../src/web/plugin-check-state.js";

const originalConfigDir = process.env.PRESSSHIP_CONFIG_DIR;

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PRESSSHIP_CONFIG_DIR;
  } else {
    process.env.PRESSSHIP_CONFIG_DIR = originalConfigDir;
  }
});

describe("Studio Plugin Check state", () => {
  it("removes stale findings for files touched by Studio edits", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-studio-check-state-"));

    await writeStudioPluginCheckState({
      pluginId: "local-example",
      pluginPath: "/tmp/example-plugin",
      slug: "example-plugin",
      name: "Example Plugin",
      skipped: false,
      available: true,
      findings: [
        {
          severity: "error",
          code: "late_escaping",
          message: "Escape output.",
          file: "example-plugin.php",
          line: 12
        },
        {
          severity: "warning",
          code: "text_domain",
          message: "Load the text domain.",
          file: "includes/admin.php",
          line: 8
        }
      ],
      summary: {
        error: 1,
        warning: 1,
        info: 0,
        total: 2,
        blocking: true
      },
      checkedAt: "2026-05-25T00:00:00.000Z"
    });

    const pruned = await removeStudioPluginCheckFindingsForFiles("local-example", ["example-plugin.php"]);

    expect(pruned).toMatchObject({
      findings: [
        {
          code: "text_domain",
          file: "includes/admin.php"
        }
      ],
      summary: {
        error: 0,
        warning: 1,
        info: 0,
        total: 1,
        blocking: false
      }
    });
    await expect(readStudioPluginCheckState("local-example")).resolves.toMatchObject({
      summary: {
        error: 0,
        total: 1
      }
    });
  });
});
