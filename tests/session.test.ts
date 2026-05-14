import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearBrowserSession, hasSavedSession } from "../src/auth/session.js";
import { getStorageStatePath } from "../src/utils/paths.js";

const originalConfigDir = process.env.PRESSSHIP_CONFIG_DIR;

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PRESSSHIP_CONFIG_DIR;
  } else {
    process.env.PRESSSHIP_CONFIG_DIR = originalConfigDir;
  }
});

describe("browser session storage", () => {
  it("clears the saved WordPress.org storage state", async () => {
    process.env.PRESSSHIP_CONFIG_DIR = await mkdtemp(path.join(tmpdir(), "pressship-config-"));
    await writeFile(
      getStorageStatePath(),
      JSON.stringify({
        cookies: [{ name: "wordpress_logged_in", value: "example|token" }]
      })
    );

    expect(await hasSavedSession()).toBe(true);
    expect(await clearBrowserSession()).toBe(true);
    expect(await hasSavedSession()).toBe(false);
    expect(await clearBrowserSession()).toBe(false);
  });
});
