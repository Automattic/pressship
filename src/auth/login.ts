import { isLoggedIn, openBrowserSession, saveBrowserSession } from "./session.js";
import {
  accountFromLoggedInCookie,
  accountFromLoggedInText,
  accountFromCurrentPageProfileLink,
  type WordPressOrgAccount
} from "./whoami.js";
import { ui } from "../ui.js";

const loginTimeoutMs = 5 * 60 * 1000;
const loginPollMs = 1_000;

export async function login(): Promise<void> {
  ui.intro("Login to WordPress.org");
  const { context, page } = await openBrowserSession({ headless: false, useSavedSession: false });

  try {
    await page.goto("https://login.wordpress.org/", { waitUntil: "domcontentloaded" });
    ui.info("Complete the WordPress.org login in the opened browser. Pressship will continue automatically.");

    const account = await ui.task("Waiting for WordPress.org login", waitForLoggedInAccount, (value) =>
      `Logged in as ${value.username}`
    );

    await ui.task("Saving browser session", () => saveBrowserSession(context), () =>
      `Saved WordPress.org browser session with user ${account.username}.`
    );
  } finally {
    await context.browser()?.close();
  }

  async function waitForLoggedInAccount(): Promise<WordPressOrgAccount> {
    const deadline = Date.now() + loginTimeoutMs;

    while (Date.now() < deadline) {
      const cookieAccount = await accountFromLoggedInCookie(context);
      if (cookieAccount && (await sessionWorksOnWordPressOrg())) {
        return cookieAccount;
      }

      const linkAccount = await accountFromCurrentPageProfileLink(page).catch(() => undefined);
      if (linkAccount && (await sessionWorksOnWordPressOrg())) {
        return linkAccount;
      }

      const pageText = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
      const textAccount = accountFromLoggedInText(pageText);
      if (textAccount && (await sessionWorksOnWordPressOrg())) {
        return textAccount;
      }

      await page.waitForTimeout(loginPollMs);
    }

    throw new Error("Timed out waiting for WordPress.org login. Run `pressship login` again.");
  }

  async function sessionWorksOnWordPressOrg(): Promise<boolean> {
    const verificationPage = await context.newPage();
    try {
      return await isLoggedIn(verificationPage);
    } finally {
      await verificationPage.close();
    }
  }
}
