import { confirm, input, select } from "@inquirer/prompts";
import path from "node:path";
import { z } from "zod";
import { hasSavedSession, isLoggedIn, openBrowserSession } from "../auth/session.js";
import { runPluginCheck } from "../checks/plugin-check.js";
import { validateReadmeFile } from "../checks/readme-validator.js";
import { hasBlockingFindings, printFindings } from "../checks/summary.js";
import { createPluginZip, stagePluginDirectory } from "../package/archive.js";
import { mergeIgnorePatterns, readPressshipIgnorePatterns } from "../package/ignore.js";
import { discoverPluginProject } from "../plugin/discover.js";
import type { PackageResult, PluginProject } from "../types.js";
import { ui } from "../ui.js";
import { formatBytes, summarizeList } from "../utils/format.js";
import { ensureDebugDir } from "../utils/paths.js";
import { matchesPluginState, readPluginStatesFromPage } from "./state.js";

const submitOptionsSchema = z.object({
  dryRun: z.boolean().default(false),
  verify: z.boolean().default(true),
  skipPluginCheck: z.boolean().default(false),
  skipReadmeValidator: z.boolean().default(false),
  yes: z.boolean().default(false),
  outputDir: z.string().optional(),
  ignore: z.array(z.string()).default([]),
  wpPath: z.string().optional(),
  overview: z.string().optional()
});

export type SubmitOptions = z.input<typeof submitOptionsSchema>;

export async function submit(pluginPath: string | undefined, rawOptions: SubmitOptions): Promise<void> {
  const options = submitOptionsSchema.parse(rawOptions);
  ui.intro(options.dryRun ? "Dry-run plugin submission" : "Submit plugin to WordPress.org");
  const rootDir = path.resolve(pluginPath ?? (await input({ message: "Plugin directory", default: process.cwd() })));

  const project = await ui.task("Discovering WordPress plugin", () => discoverPluginProject(rootDir), (value) =>
    `Discovered ${value.headers.pluginName}`
  );
  const ignorePatterns = mergeIgnorePatterns(
    options.ignore,
    await readPressshipIgnorePatterns(project.rootDir)
  );
  printProjectSummary(project);

  const readmeFindings = !options.verify
    ? []
    : await ui.task("Validating readme.txt", async () =>
        project.readmePath
          ? (await validateReadmeFile(project.readmePath, {
              skipRemote: options.skipReadmeValidator,
              headless: true
            })).findings
          : [
              {
                severity: "error" as const,
                code: "readme.missing",
                message: "WordPress.org submissions require a readme.txt file."
              }
            ]
      );
  if (!options.verify) {
    ui.warn("Skipping readme validation and Plugin Check because --no-verify was passed.");
  } else {
    printFindings("Readme validation", readmeFindings);
  }

  const packageResult = await ui.task(
    "Creating submission zip",
    () =>
      createPluginZip(project, {
        outputDir: options.outputDir,
        ignore: ignorePatterns
      }),
    (value) => `Created submission zip (${formatBytes(value.sizeBytes)})`
  );
  printPackageSummary(packageResult);

  const checkTarget = await ui.task("Preparing Plugin Check target", () =>
    stagePluginDirectory(project, {
      outputDir: options.outputDir,
      ignore: ignorePatterns
    })
  );
  const pluginCheck = await ui.task("Running WordPress.org Plugin Check", () =>
    runPluginCheck(checkTarget.path, {
      skip: !options.verify || options.skipPluginCheck,
      mode: "new",
      wpPath: options.wpPath
    })
  );
  if (options.verify) {
    printFindings("Plugin Check", pluginCheck.findings);
  }

  const blockingFindings = hasBlockingFindings(readmeFindings) || hasBlockingFindings(pluginCheck.findings);
  if (blockingFindings && !options.yes) {
    const shouldContinue = await confirm({
      message: "Blocking findings were reported. Continue anyway?",
      default: false
    });
    if (!shouldContinue) {
      throw new Error("Submission cancelled because validation reported blocking findings.");
    }
  }

  if (options.dryRun) {
    ui.success("Dry run complete. No upload was attempted.");
    return;
  }

  await ensureSession();
  const overview =
    options.overview ??
    (await input({
      message: "Brief plugin overview for the WordPress.org submission form",
      default: project.headers.description ?? ""
    }));

  if (!options.yes) {
    await select({
      message: "Confirm this is a new WordPress.org review submission.",
      choices: [
        { name: "Yes, upload this zip to WordPress.org for review", value: "yes" },
        { name: "No, cancel", value: "no" }
      ]
    }).then((answer) => {
      if (answer !== "yes") {
        throw new Error("Submission cancelled.");
      }
    });
  }

  await ui.task("Uploading zip to WordPress.org", () => uploadToWordPressOrg(project, packageResult, overview));
}

async function uploadToWordPressOrg(
  project: PluginProject,
  packageResult: PackageResult,
  overview: string
): Promise<void> {
  const { context, page } = await openBrowserSession({ headless: false });

  try {
    if (!(await isLoggedIn(page))) {
      throw new Error("Saved WordPress.org session is not logged in. Run `pressship login` first.");
    }

    const body = page.locator("body");
    const bodyText = await body.innerText({ timeout: 10_000 });
    if (/already.*submitted|pending review/i.test(bodyText)) {
      ui.warn("WordPress.org indicates this account may already have a pending submission.");
    }

    if (await uploadUpdatedPluginIfAvailable(page, project, packageResult, overview)) {
      const resultText = await page.locator("body").innerText({ timeout: 15_000 });
      ui.success(extractSubmissionResult(resultText));
      return;
    }

    await fillOptionalText(page, /plugin.*name|name/i, project.headers.pluginName);
    await fillOptionalText(page, /description|overview|what.*does/i, overview);
    await checkRequiredCheckboxes(page);

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(packageResult.zipPath);

    const submitButton = page
      .getByRole("button", { name: /upload|submit|send/i })
      .or(page.locator('input[type="submit"]'))
      .first();

    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => undefined),
      submitButton.click()
    ]);

    const resultText = await page.locator("body").innerText({ timeout: 15_000 });
    ui.success(extractSubmissionResult(resultText));
  } catch (error) {
    const debugDir = await ensureDebugDir();
    const screenshotPath = path.join(debugDir, `submit-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
    throw new Error(
      `WordPress.org submission automation failed. Screenshot saved to ${screenshotPath}. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  } finally {
    await context.browser()?.close();
  }
}

async function uploadUpdatedPluginIfAvailable(
  page: import("playwright").Page,
  project: PluginProject,
  packageResult: PackageResult,
  overview: string
): Promise<boolean> {
  const states = await readPluginStatesFromPage(page);
  const state = states.find((item) => matchesPluginState(item, project.slug) || matchesPluginState(item, project.headers.pluginName));

  if (!state?.canUploadUpdate) {
    return false;
  }

  ui.info(`Found existing WordPress.org submission for ${state.name}; uploading an updated zip for review.`);

  const item = page
    .locator(".plugin-submission-item")
    .filter({ hasText: state.assignedSlug ?? state.name })
    .first();
  const form = item.locator('form:has(input[name="action"][value="upload-additional"])').first();

  await form.evaluate((element) => element.classList.remove("hidden")).catch(() => undefined);
  await form.locator('textarea[name="comment"]').fill(overview).catch(() => undefined);
  await form.locator('input[type="file"][name="zip_file"]').setInputFiles(packageResult.zipPath);

  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => undefined),
    form.locator('input[type="submit"], button[type="submit"]').first().click()
  ]);

  return true;
}

async function ensureSession(): Promise<void> {
  if (!(await hasSavedSession())) {
    throw new Error("No WordPress.org browser session found. Run `pressship login` first.");
  }
}

async function fillOptionalText(page: import("playwright").Page, label: RegExp, value: string): Promise<void> {
  const field = page.getByLabel(label).first();
  if ((await field.count()) === 0) {
    return;
  }

  await field.fill(value).catch(() => undefined);
}

async function checkRequiredCheckboxes(page: import("playwright").Page): Promise<void> {
  const checkboxes = page.locator('input[type="checkbox"]');
  const count = await checkboxes.count();

  for (let index = 0; index < count; index += 1) {
    const checkbox = checkboxes.nth(index);
    const required = await checkbox.evaluate((element) => element.hasAttribute("required")).catch(() => false);
    if (required) {
      await checkbox.check().catch(() => undefined);
    }
  }
}

function printProjectSummary(project: PluginProject): void {
  ui.section("Plugin");
  ui.keyValue("Name", ui.value(project.headers.pluginName));
  ui.keyValue("Slug", project.slug);
  ui.keyValue("Version", project.version ?? "unknown");
  ui.keyValue("Main file", ui.path(path.relative(project.rootDir, project.mainFile)));
  ui.keyValue("Readme", project.readmePath ? ui.path(path.relative(project.rootDir, project.readmePath)) : "missing");
}

function printPackageSummary(packageResult: PackageResult): void {
  ui.section("Package");
  ui.keyValue("Zip", `${ui.path(packageResult.zipPath)} ${ui.muted(`(${formatBytes(packageResult.sizeBytes)})`)}`);
  ui.keyValue("Files", `${packageResult.files.length}`);
  console.log(ui.muted(summarizeList(packageResult.files)));
}

function extractSubmissionResult(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  const match = compact.match(/(submitted.+|queued.+|error.+|warning.+)$/i);
  return match?.[1] ?? compact.slice(0, 1200);
}
