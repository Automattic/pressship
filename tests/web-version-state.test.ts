import { describe, expect, it } from "vitest";
import { calculateVersionState, compareVersions } from "../src/web/version-state.js";

describe("studio version state", () => {
  it("marks matching new versions as ready", () => {
    expect(
      calculateVersionState({
        slug: "example-plugin",
        name: "Example Plugin",
        path: "/tmp/example-plugin",
        localVersion: "1.2.3",
        readmeStableTag: "1.2.3",
        remoteVersion: "1.2.2",
        svnTags: ["1.2.1", "1.2.2"],
        svnTagsSource: "remote"
      })
    ).toMatchObject({
      statuses: ["ready"],
      releaseBlocked: false,
      latestSvnTag: "1.2.2"
    });
  });

  it("blocks duplicate release tags and header/readme mismatches", () => {
    expect(
      calculateVersionState({
        slug: "example-plugin",
        name: "Example Plugin",
        path: "/tmp/example-plugin",
        localVersion: "1.2.3",
        readmeStableTag: "1.2.2",
        remoteVersion: "1.2.3",
        svnTags: ["1.2.3"],
        svnTagsSource: "local"
      })
    ).toMatchObject({
      statuses: ["header_readme_mismatch", "duplicate_tag_blocked"],
      releaseBlocked: true
    });
  });

  it("reports remote newer and unknown SVN state without blocking non-release inspection", () => {
    expect(
      calculateVersionState({
        slug: "example-plugin",
        name: "Example Plugin",
        path: "/tmp/example-plugin",
        localVersion: "1.2.3",
        readmeStableTag: "1.2.3",
        remoteVersion: "1.2.4",
        svnTagsSource: "unknown"
      })
    ).toMatchObject({
      statuses: ["remote_newer", "unknown_svn_state"],
      releaseBlocked: false
    });
  });

  it("compares simple semantic versions", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
    expect(compareVersions("1.2.3", "1.3.0")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });
});
