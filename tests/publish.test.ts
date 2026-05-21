import { describe, expect, it } from "vitest";
import { resolvePublishRoute } from "../src/wordpress-org/publish.js";

describe("npm-style publish routing", () => {
  it("routes forced submit without detection", () => {
    expect(resolvePublishRoute({ forceSubmit: true })).toEqual({
      action: "submit",
      reason: "`--submit` was passed"
    });
  });

  it("routes forced release without detection", () => {
    expect(resolvePublishRoute({ forceRelease: true })).toEqual({
      action: "release",
      reason: "`--release` was passed"
    });
  });

  it("rejects conflicting forced routes", () => {
    expect(() => resolvePublishRoute({ forceSubmit: true, forceRelease: true })).toThrow(
      "Choose either `--submit` or `--release`, not both."
    );
  });

  it("routes pending WordPress.org submissions to submit", () => {
    expect(resolvePublishRoute({ hasPendingSubmission: true, svnRepositoryExists: true })).toEqual({
      action: "submit",
      reason: "matching WordPress.org submission is pending or reuploadable"
    });
  });

  it("routes approved SVN repositories to release when no pending submission is found", () => {
    expect(resolvePublishRoute({ hasPendingSubmission: false, svnRepositoryExists: true })).toEqual({
      action: "release",
      reason: "WordPress.org SVN repository exists"
    });
  });

  it("routes local SVN working copies to release", () => {
    expect(resolvePublishRoute({ isLocalSvnWorkingCopy: true, hasPendingSubmission: true })).toEqual({
      action: "release",
      reason: "local WordPress.org SVN working copy"
    });
  });

  it("routes missing SVN repositories to submit", () => {
    expect(resolvePublishRoute({ svnRepositoryExists: false })).toEqual({
      action: "submit",
      reason: "WordPress.org SVN repository was not found"
    });
  });

  it("requests a prompt for ambiguous interactive publishes", () => {
    expect(resolvePublishRoute({ canPrompt: true })).toEqual({
      action: "prompt",
      reason: "publish target could not be detected confidently"
    });
  });

  it("fails for ambiguous non-interactive publishes", () => {
    expect(() =>
      resolvePublishRoute({ svnRepositoryExists: undefined, canPrompt: false })
    ).toThrow("Could not determine whether to submit or release. Re-run with `--submit` or `--release`.");
  });
});
