import { describe, expect, it } from "vitest";
import { matchesPluginState, resolveStatusFilter, type WordPressOrgPluginState } from "../src/wordpress-org/state.js";

const pressmindState: WordPressOrgPluginState = {
  name: "Pressmind",
  assignedSlug: "pressmind",
  reviewStatus: "Awaiting Review",
  canChangeSlug: true,
  canUploadUpdate: true
};

describe("WordPress.org plugin state matching", () => {
  it("matches by assigned slug", () => {
    expect(matchesPluginState(pressmindState, "pressmind")).toBe(true);
  });

  it("matches by plugin name", () => {
    expect(matchesPluginState(pressmindState, "Pressmind")).toBe(true);
  });

  it("does not match unrelated plugins", () => {
    expect(matchesPluginState(pressmindState, "other-plugin")).toBe(false);
  });
});

describe("status filter resolution", () => {
  it("uses plain values as both slug and name", async () => {
    await expect(resolveStatusFilter("pressmind")).resolves.toEqual({
      slug: "pressmind",
      name: "pressmind",
      label: "pressmind"
    });
  });
});
