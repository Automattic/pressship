import { readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { execa } from "execa";
import { chromium, type BrowserContext, type Page } from "playwright";
import { ensureConfigDir, getStorageStatePath, pathExists } from "../utils/paths.js";

const require = createRequire(import.meta.url);

export type BrowserSessionOptions = {
  headless?: boolean;
};

export async function openBrowserSession(
  options: BrowserSessionOptions = {}
): Promise<{ context: BrowserContext; page: Page }> {
  await ensureConfigDir();
  const browser = await launchChromium(options);
  const storageStatePath = getStorageStatePath();
  const context = await browser.newContext(
    pathExists(storageStatePath) ? { storageState: storageStatePath } : undefined
  );
  const page = await context.newPage();

  return { context, page };
}

export async function saveBrowserSession(context: BrowserContext): Promise<void> {
  await ensureConfigDir();
  await context.storageState({ path: getStorageStatePath() });
}

export async function clearBrowserSession(): Promise<boolean> {
  const storageStatePath = getStorageStatePath();
  if (!pathExists(storageStatePath)) {
    return false;
  }

  await rm(storageStatePath, { force: true });
  return true;
}

export async function hasSavedSession(): Promise<boolean> {
  const storageStatePath = getStorageStatePath();
  if (!pathExists(storageStatePath)) {
    return false;
  }

  try {
    const state = JSON.parse(await readFile(storageStatePath, "utf8")) as { cookies?: unknown[] };
    return Array.isArray(state.cookies) && state.cookies.length > 0;
  } catch {
    return false;
  }
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto("https://wordpress.org/plugins/developers/add/", { waitUntil: "domcontentloaded" });
  const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
  return !/please log in|log in to submit|before you can upload/i.test(bodyText);
}

function isMissingPlaywrightBrowserError(error: unknown): boolean {
  return error instanceof Error && /executable doesn't exist|playwright install/i.test(error.message);
}

async function launchChromium(options: BrowserSessionOptions) {
  try {
    return await chromium.launch({ headless: options.headless ?? false });
  } catch (error) {
    if (!isMissingPlaywrightBrowserError(error)) {
      throw error;
    }

    await installChromium();
    return chromium.launch({ headless: options.headless ?? false });
  }
}

async function installChromium(): Promise<void> {
  console.log("Playwright Chromium is missing. Installing it now...");

  try {
    const playwrightCli = require.resolve("playwright/cli");
    await execa(process.execPath, [playwrightCli, "install", "chromium"], {
      stdio: "inherit"
    });
  } catch (error) {
    throw new Error(
      `Could not install Playwright Chromium automatically. Run \`npx playwright install chromium\` and try again. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
