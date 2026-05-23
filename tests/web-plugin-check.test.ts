import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addStudioPluginCheckLineHints,
  normalizeStudioPluginCheckFindings,
  summarizeStudioPluginCheckFindings
} from "../src/web/plugin-check.js";

describe("Studio Plugin Check helpers", () => {
  it("normalizes Plugin Check file paths for editor annotations", () => {
    const findings = normalizeStudioPluginCheckFindings(
      [
        {
          severity: "error",
          code: "late_escaping",
          message: "Escape output.",
          file: "/tmp/example-plugin/includes/admin.php",
          line: 12,
          column: 4
        },
        {
          severity: "warning",
          code: "i18n",
          message: "Use translators comments.",
          file: "example-plugin/example-plugin.php",
          line: 7
        }
      ],
      "/tmp/example-plugin",
      "example-plugin"
    );

    expect(findings).toEqual([
      {
        severity: "error",
        code: "late_escaping",
        message: "Escape output.",
        file: "includes/admin.php",
        originalFile: "/tmp/example-plugin/includes/admin.php",
        line: 12,
        column: 4
      },
      {
        severity: "warning",
        code: "i18n",
        message: "Use translators comments.",
        file: "example-plugin.php",
        originalFile: "example-plugin/example-plugin.php",
        line: 7
      }
    ]);
  });

  it("summarizes Plugin Check findings for Studio", () => {
    expect(
      summarizeStudioPluginCheckFindings([
        { severity: "error", message: "A" },
        { severity: "warning", message: "B" },
        { severity: "info", message: "C" },
        { severity: "warning", message: "D" }
      ])
    ).toEqual({
      error: 1,
      warning: 2,
      info: 1,
      total: 4,
      blocking: true
    });
  });

  it("anchors file-level readme findings to matching readme metadata lines", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pressship-studio-check-"));
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "readme.txt"),
      `=== Example Plugin ===
Contributors: example
Tags: example
Requires at least: 6.5
Tested up to: 6.8
Stable tag: 1.0.0
License: GPLv2 or later
`
    );

    const findings = await addStudioPluginCheckLineHints(
      [
        {
          severity: "error",
          code: "outdated_tested_upto_header",
          message: "Tested up to: 6.8 < 7.0.",
          file: "readme.txt",
          line: 0,
          column: 0
        },
        {
          severity: "error",
          code: "license_mismatch",
          message: "Your plugin has a different license declared in the readme file and plugin header.",
          file: "readme.txt",
          line: 0,
          column: 0
        }
      ],
      root
    );

    expect(findings.map((finding) => ({ code: finding.code, line: finding.line, column: finding.column }))).toEqual([
      { code: "outdated_tested_upto_header", line: 5, column: 1 },
      { code: "license_mismatch", line: 7, column: 1 }
    ]);
  });
});
