import { input, password } from "@inquirer/prompts";
import { readFile, writeFile } from "node:fs/promises";
import type { BrowserContext } from "playwright";
import { z } from "zod";
import { hasSavedSession, openBrowserSession } from "../auth/session.js";
import { getWordPressOrgAccount } from "../auth/whoami.js";
import { ui } from "../ui.js";
import { ensureConfigDir, getSvnCredentialsPath, pathExists } from "../utils/paths.js";

const svnCredentialsSchema = z.object({
  credentials: z.record(
    z.string(),
    z.object({
      password: z.string().min(1)
    })
  )
});

type SvnCredentialsFile = z.infer<typeof svnCredentialsSchema>;

export type SvnCredentials = {
  username: string;
  password: string;
};

export async function resolveSvnCredentials(username?: string): Promise<SvnCredentials> {
  const resolvedUsername = username ?? (await resolveSvnUsername());
  const savedPassword = await getSavedSvnPassword(resolvedUsername);

  if (savedPassword) {
    return { username: resolvedUsername, password: savedPassword };
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      `No saved WordPress.org SVN password found for ${resolvedUsername}. Generate one at ${getSvnPasswordUrl(
        resolvedUsername
      )} and run this command interactively once.`
    );
  }

  ui.section("WordPress.org SVN password");
  const svnPasswordUrl = getSvnPasswordUrl(resolvedUsername);
  ui.info(`Open ${ui.path(svnPasswordUrl)}`);
  ui.info("Generate an SVN password there, then paste it below. Pressship will save it locally for future releases.");

  const openedContext = await openSvnPasswordPage(svnPasswordUrl);
  try {
    const svnPassword = await password({
      message: `SVN password for ${resolvedUsername}`,
      mask: "*",
      validate: (value) => (value.trim() ? true : "Enter the generated WordPress.org SVN password.")
    });

    await saveSvnPassword(resolvedUsername, svnPassword);
    ui.success(`Saved SVN password for ${resolvedUsername} in ${ui.path(getSvnCredentialsPath())}`);

    return { username: resolvedUsername, password: svnPassword };
  } finally {
    await openedContext?.browser()?.close().catch(() => undefined);
  }
}

export async function resolveSvnUsername(): Promise<string> {
  if (await hasSavedSession()) {
    try {
      return (await getWordPressOrgAccount()).username;
    } catch {
      // Fall through to prompt; the browser session may be stale.
    }
  }

  if (!process.stdin.isTTY) {
    throw new Error("Could not infer a WordPress.org username. Re-run with `--username <username>`.");
  }

  return input({
    message: "WordPress.org SVN username",
    validate: (value) => (value.trim() ? true : "Enter your WordPress.org username.")
  });
}

export async function getSavedSvnPassword(username: string): Promise<string | undefined> {
  const file = await readSvnCredentialsFile();
  return file.credentials[username]?.password;
}

export async function saveSvnPassword(username: string, svnPassword: string): Promise<void> {
  await ensureConfigDir();
  const file = await readSvnCredentialsFile();
  file.credentials[username] = { password: svnPassword };
  await writeFile(getSvnCredentialsPath(), `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
}

export function getSvnPasswordUrl(username: string): string {
  return `https://profiles.wordpress.org/${encodeURIComponent(username)}/profile/edit/group/3/?screen=svn-password`;
}

async function openSvnPasswordPage(url: string): Promise<BrowserContext | undefined> {
  try {
    const { context, page } = await openBrowserSession({ headless: false });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return context;
  } catch {
    ui.warn("Could not open the SVN password page automatically. Open the URL above in your browser.");
    return undefined;
  }
}

async function readSvnCredentialsFile(): Promise<SvnCredentialsFile> {
  const credentialsPath = getSvnCredentialsPath();
  if (!pathExists(credentialsPath)) {
    return { credentials: {} };
  }

  try {
    return svnCredentialsSchema.parse(JSON.parse(await readFile(credentialsPath, "utf8")));
  } catch {
    return { credentials: {} };
  }
}
