import { readFile } from "node:fs/promises";
import type { Page } from "playwright";
import { openBrowserSession } from "../auth/session.js";
import { parseReadme, validateReadmeLocally } from "../plugin/readme.js";
import type { Finding } from "../types.js";

export type ReadmeValidationOptions = {
  skipRemote?: boolean;
  headless?: boolean;
};

export type ReadmeValidationResult = {
  skippedRemote: boolean;
  findings: Finding[];
  rawRemoteText?: string;
};

export async function validateReadmeFile(
  readmePath: string,
  options: ReadmeValidationOptions = {}
): Promise<ReadmeValidationResult> {
  const contents = await readFile(readmePath, "utf8");
  const localFindings = validateReadmeLocally(contents, parseReadme(contents));

  if (options.skipRemote) {
    return { skippedRemote: true, findings: localFindings };
  }

  const remote = await validateReadmeWithWordPress(contents, options);
  return {
    skippedRemote: false,
    findings: [...localFindings, ...remote.findings],
    rawRemoteText: remote.rawRemoteText
  };
}

export async function validateReadmeWithWordPress(
  contents: string,
  options: ReadmeValidationOptions = {}
): Promise<{ findings: Finding[]; rawRemoteText: string }> {
  const { context, page } = await openBrowserSession({ headless: options.headless ?? true });

  try {
    await page.goto("https://wordpress.org/plugins/developers/readme-validator/", {
      waitUntil: "domcontentloaded"
    });
    await fillReadmeValidator(page, contents);
    const rawRemoteText = await page.locator("body").innerText({ timeout: 15_000 });
    return {
      rawRemoteText,
      findings: parseReadmeValidatorText(rawRemoteText)
    };
  } finally {
    await context.browser()?.close();
  }
}

export function parseReadmeValidatorText(text: string): Finding[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const findings: Finding[] = [];

  for (const line of lines) {
    if (/^(error|warning|notice):/i.test(line)) {
      const [severityText, ...messageParts] = line.split(":");
      findings.push({
        severity: normalizeSeverity(severityText),
        message: messageParts.join(":").trim(),
        code: "readme_validator.remote"
      });
    }
  }

  if (findings.length === 0 && /fatal error|parse error|invalid|not valid/i.test(text)) {
    findings.push({
      severity: "error",
      code: "readme_validator.remote",
      message: compactText(text)
    });
  }

  return findings;
}

async function fillReadmeValidator(page: Page, contents: string): Promise<void> {
  const textarea = page.locator("textarea").first();
  await textarea.fill(contents);

  const submit = page
    .getByRole("button", { name: /validate|submit|check/i })
    .or(page.locator('input[type="submit"]'))
    .first();

  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => undefined),
    submit.click()
  ]);
}

function normalizeSeverity(value: string): Finding["severity"] {
  const normalized = value.toLowerCase();
  if (normalized.includes("error")) {
    return "error";
  }
  if (normalized.includes("warning")) {
    return "warning";
  }
  return "info";
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}
