import type { Finding } from "../types.js";
import { ui } from "../ui.js";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

export function hasBlockingFindings(findings: Finding[]): boolean {
  return findings.some((finding) => finding.severity === "error");
}

export function printFindings(title: string, findings: Finding[]): void {
  if (findings.length === 0) {
    ui.success(`${title}: ${green("no findings")}`);
    return;
  }

  ui.section(`${title}: ${formatCounts(findings)}`);
  for (const finding of findings) {
    const severity = formatSeverity(finding.severity);
    const code = finding.code ? dim(`[${finding.code}]`) : "";
    const location = formatLocation(finding);
    const meta = [code, location].filter(Boolean).join(" ");
    const prefix = meta ? `${severity} ${meta}` : severity;

    console.log(`  ${prefix}`);
    console.log(`    ${finding.message}`);
  }
}

function formatCounts(findings: Finding[]): string {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const info = findings.filter((finding) => finding.severity === "info").length;
  const parts = [
    errors ? red(`${errors} error${errors === 1 ? "" : "s"}`) : "",
    warnings ? yellow(`${warnings} warning${warnings === 1 ? "" : "s"}`) : "",
    info ? blue(`${info} info`) : ""
  ].filter(Boolean);

  return parts.join(", ");
}

function formatSeverity(severity: Finding["severity"]): string {
  if (severity === "error") {
    return red("ERROR");
  }
  if (severity === "warning") {
    return yellow("WARN ");
  }
  return blue("INFO ");
}

function formatLocation(finding: Finding): string {
  if (!finding.file) {
    return dim("(global)");
  }

  const parts = [finding.file, finding.line, finding.column].filter(
    (part) => part !== undefined && part !== 0
  );
  return cyan(parts.join(":"));
}

function bold(value: string): string {
  return color(value, "1");
}

function red(value: string): string {
  return color(value, "31");
}

function yellow(value: string): string {
  return color(value, "33");
}

function green(value: string): string {
  return color(value, "32");
}

function blue(value: string): string {
  return color(value, "34");
}

function cyan(value: string): string {
  return color(value, "36");
}

function dim(value: string): string {
  return color(value, "2");
}

function color(value: string, code: string): string {
  return useColor ? `\u001B[${code}m${value}\u001B[0m` : value;
}
