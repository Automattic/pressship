import { describe, expect, it } from "vitest";
import { createReleaseCommandPlan } from "../src/svn/release.js";

describe("SVN release planning", () => {
  it("builds the expected command plan", () => {
    const plan = createReleaseCommandPlan(
      "example-plugin",
      "/tmp/example-plugin-svn",
      "1.2.3",
      "Release example-plugin 1.2.3",
      "WpUser"
    );

    expect(plan).toEqual([
      {
        command: "svn",
        args: [
          "checkout",
          "https://plugins.svn.wordpress.org/example-plugin",
          "/tmp/example-plugin-svn",
          "--username",
          "WpUser"
        ]
      },
      { command: "svn", args: ["add", "--force", "trunk"], cwd: "/tmp/example-plugin-svn" },
      { command: "svn", args: ["copy", "trunk", "tags/1.2.3"], cwd: "/tmp/example-plugin-svn" },
      { command: "svn", args: ["status"], cwd: "/tmp/example-plugin-svn" },
      {
        command: "svn",
        args: ["commit", "-m", "Release example-plugin 1.2.3", "--username", "WpUser"],
        cwd: "/tmp/example-plugin-svn"
      }
    ]);
  });
});
