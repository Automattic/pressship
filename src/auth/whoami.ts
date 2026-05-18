import type { BrowserContext, Page } from "playwright";
import { hasSavedSession, openBrowserSession } from "./session.js";
import { ui } from "../ui.js";

export type WhoamiOptions = {
  json?: boolean;
};

export type WordPressOrgAccount = {
  username: string;
  profileUrl: string;
  displayName?: string;
};

export async function whoami(options: WhoamiOptions = {}): Promise<void> {
  if (!(await hasSavedSession())) {
    throw new Error("Not logged in. Run `pressship login` first.");
  }

  const account = await ui.task("Checking saved WordPress.org session", getWordPressOrgAccount, (value) =>
    `Authenticated as ${value.username}`
  );

  if (options.json) {
    console.log(JSON.stringify(account, null, 2));
    return;
  }

  ui.success(account.username);
}

export async function getWordPressOrgAccount(): Promise<WordPressOrgAccount> {
  const { context, page } = await openBrowserSession({ headless: true });

  try {
    return await detectWordPressOrgAccount(context, page);
  } finally {
    await context.browser()?.close();
  }
}

export async function detectWordPressOrgAccount(
  context: BrowserContext,
  page?: Page
): Promise<WordPressOrgAccount> {
  if (page) {
    const account = await accountFromCurrentPageProfileLink(page);
    if (account) {
      return account;
    }

    await page.goto("https://wordpress.org/plugins/developers/add/", { waitUntil: "domcontentloaded" });
    const navigatedAccount = await accountFromCurrentPageProfileLink(page);
    if (navigatedAccount) {
      return navigatedAccount;
    }

    const pageText = await page.locator("body").innerText({ timeout: 10_000 }).catch(() => "");
    const textAccount = accountFromLoggedInText(pageText);
    if (textAccount) {
      return textAccount;
    }
  }

  const cookieAccount = page ? undefined : await accountFromLoggedInCookie(context);
  if (cookieAccount) {
    return cookieAccount;
  }

  throw new Error("Saved WordPress.org session is not logged in. Run `pressship login` again.");
}

export function usernameFromProfileUrl(profileUrl: string): string | undefined {
  const url = new URL(profileUrl);
  if (url.hostname !== "profiles.wordpress.org") {
    return undefined;
  }

  const username = url.pathname.split("/").filter(Boolean)[0];
  return username && username !== "me" ? username : undefined;
}

export function usernameFromLoggedInCookieValue(value: string): string | undefined {
  const decoded = safeDecodeURIComponent(value);
  const rawUsername = decoded.split("|")[0];
  if (!rawUsername) {
    return undefined;
  }

  return rawUsername;
}

export async function accountFromLoggedInCookie(
  context: BrowserContext
): Promise<WordPressOrgAccount | undefined> {
  const cookies = await context.cookies([
    "https://wordpress.org",
    "https://login.wordpress.org",
    "https://profiles.wordpress.org"
  ]);
  const loggedInCookie = cookies.find(
    (cookie) => cookie.domain.endsWith("wordpress.org") && /logged_in/i.test(cookie.name)
  );
  const username = loggedInCookie ? usernameFromLoggedInCookieValue(loggedInCookie.value) : undefined;

  return username
    ? {
        username,
        profileUrl: `https://profiles.wordpress.org/${username}/`
      }
    : undefined;
}

export function accountFromLoggedInText(text: string): WordPressOrgAccount | undefined {
  const normalized = text.replace(/\s+/g, " ");
  const match = normalized.match(/\b(?:Logged in (?:user|as)|You are logged in as):?\s*([A-Za-z0-9_.@-]+)/i);
  const username = match?.[1];

  return username
    ? {
        username,
        profileUrl: `https://profiles.wordpress.org/${username}/`
      }
    : undefined;
}

export async function accountFromCurrentPageProfileLink(page: Page): Promise<WordPressOrgAccount | undefined> {
  const profileUrl = await page
    .locator('a[href*="profiles.wordpress.org/"]')
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href))
        .find((href) => {
          const url = new URL(href, "https://profiles.wordpress.org");
          const username = url.pathname.split("/").filter(Boolean)[0];
          return username && username !== "me";
        })
    );

  if (!profileUrl) {
    return undefined;
  }

  const username = usernameFromProfileUrl(profileUrl);
  return username ? { username, profileUrl } : undefined;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
