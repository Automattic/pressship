import { describe, expect, it, vi } from "vitest";
import {
  accountFromLoggedInText,
  detectWordPressOrgAccount,
  usernameFromLoggedInCookieValue,
  usernameFromProfileUrl
} from "../src/auth/whoami.js";

describe("whoami profile URL parsing", () => {
  it("extracts the username from a WordPress.org profile URL", () => {
    expect(usernameFromProfileUrl("https://profiles.wordpress.org/example-user/")).toBe("example-user");
  });

  it("does not treat /me as a resolved username", () => {
    expect(usernameFromProfileUrl("https://profiles.wordpress.org/me/")).toBeUndefined();
  });

  it("ignores non-profile URLs", () => {
    expect(usernameFromProfileUrl("https://login.wordpress.org/")).toBeUndefined();
  });
});

describe("WordPress.org logged-in cookie parsing", () => {
  it("extracts the username before the cookie separators", () => {
    expect(usernameFromLoggedInCookieValue("example-user%40domain.test|123|token|hash")).toBe(
      "example-user@domain.test"
    );
  });

  it("extracts the username from encoded cookie separators", () => {
    expect(usernameFromLoggedInCookieValue("example-user%7C123%7Ctoken%7Chash")).toBe("example-user");
  });
});

describe("WordPress.org logged-in page text parsing", () => {
  it("extracts the username from Logged in as text", () => {
    expect(accountFromLoggedInText("Logged in as example-user")).toMatchObject({
      username: "example-user"
    });
  });

  it("extracts the username from Logged in user text", () => {
    expect(accountFromLoggedInText("Logged in user: example.user")).toMatchObject({
      username: "example.user"
    });
  });

  it("extracts the username from colon-separated Logged in as text", () => {
    expect(accountFromLoggedInText("Logged in as: example-user")).toMatchObject({
      username: "example-user"
    });
  });

  it("extracts the username from already logged in text", () => {
    expect(accountFromLoggedInText("You are logged in as example-user")).toMatchObject({
      username: "example-user"
    });
  });
});

describe("WordPress.org account detection", () => {
  it("does not trust a stale logged-in cookie when page verification fails", async () => {
    const context = {
      cookies: vi.fn(async () => [
        {
          name: "wporg_logged_in",
          value: "example-user%7C123%7Ctoken%7Chash",
          domain: ".wordpress.org"
        }
      ])
    };
    const page = {
      goto: vi.fn(async () => undefined),
      locator: vi.fn(() => ({
        evaluateAll: vi.fn(async () => undefined),
        innerText: vi.fn(async () => "Before you can upload a new plugin, please log in.")
      }))
    };

    await expect(
      detectWordPressOrgAccount(
        context as unknown as Parameters<typeof detectWordPressOrgAccount>[0],
        page as unknown as Parameters<typeof detectWordPressOrgAccount>[1]
      )
    ).rejects.toThrow("Saved WordPress.org session is not logged in. Run `pressship login` again.");
    expect(context.cookies).not.toHaveBeenCalled();
  });
});
