import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hostedPluginInfoFromApi, localPluginInfo, resolveHostedInfoSlug, slugFromHostedTarget } from "../src/plugin/info.js";
import { discoverPluginProject } from "../src/plugin/discover.js";

describe("plugin info target parsing", () => {
  it("extracts a slug from a WordPress.org plugin URL", () => {
    expect(slugFromHostedTarget("https://wordpress.org/plugins/16deza-table-cell-extras/")).toBe(
      "16deza-table-cell-extras"
    );
  });

  it("uses plain values as hosted plugin slugs", () => {
    expect(slugFromHostedTarget("16deza-table-cell-extras")).toBe("16deza-table-cell-extras");
  });
});

describe("hosted plugin info", () => {
  it("resolves remote info slugs from local plugin paths", async () => {
    const root = await samplePlugin();

    await expect(resolveHostedInfoSlug(root)).resolves.toBe("example-plugin");
  });

  it("resolves remote info slugs from hosted targets", async () => {
    await expect(resolveHostedInfoSlug("https://wordpress.org/plugins/list-all-urls/")).resolves.toBe("list-all-urls");
    await expect(resolveHostedInfoSlug("list-all-urls")).resolves.toBe("list-all-urls");
  });

  it("normalizes WordPress.org plugin API responses", () => {
    const info = hostedPluginInfoFromApi(
      {
        name: "16Deza Table Cell Extras",
        slug: "16deza-table-cell-extras",
        version: "1.2.4",
        author: '<a href="https://profiles.wordpress.org/juurokudezain/">JuuRokuDezain</a>',
        author_profile: "https://profiles.wordpress.org/juurokudezain/",
        requires: "6.4",
        tested: "6.9.4",
        requires_php: "7.4",
        active_installs: 50,
        rating: 80,
        num_ratings: 4,
        support_threads: 3,
        support_threads_resolved: 2,
        last_updated: "2026-05-09 4:08pm GMT",
        download_link: "https://downloads.wordpress.org/plugin/16deza-table-cell-extras.1.2.4.zip",
        tags: {
          "block-editor": "block-editor",
          table: "table"
        },
        sections: {
          description: "<p>Table Cell Extras adds WordPress&#8217;s inline formatting tools.</p>"
        }
      },
      "fallback-slug"
    );

    expect(info).toMatchObject({
      source: "wordpress.org",
      name: "16Deza Table Cell Extras",
      slug: "16deza-table-cell-extras",
      version: "1.2.4",
      author: "JuuRokuDezain",
      rating: 4,
      ratingPercent: 80,
      tags: ["block-editor", "table"],
      description: "Table Cell Extras adds WordPress’s inline formatting tools."
    });
  });

  it("ignores non-string missing WordPress.org requirement fields", () => {
    const info = hostedPluginInfoFromApi(
      {
        name: "Hello Dolly",
        slug: "hello-dolly",
        requires: false,
        requires_php: false
      },
      "hello-dolly"
    );

    expect(info.requires).toBeUndefined();
    expect(info.requiresPhp).toBeUndefined();
  });
});

describe("local plugin info", () => {
  it("summarizes discovered local plugin metadata", async () => {
    const root = await samplePlugin();
    const project = await discoverPluginProject(root);
    const info = localPluginInfo(project);

    expect(info).toMatchObject({
      source: "local",
      rootDir: root,
      name: "Example Plugin",
      slug: "example-plugin",
      version: "1.2.3",
      description: "Does example things.",
      author: "Example Author",
      textDomain: "example-plugin",
      requiresAtLeast: "6.0",
      requiresPhp: "8.1",
      license: "GPLv2 or later"
    });
    expect(info.readme?.tags).toEqual(["example", "tools"]);
  });
});

async function samplePlugin(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "pressship-info-plugin-"));
  await writeFile(
    path.join(root, "example-plugin.php"),
    `<?php
/**
 * Plugin Name: Example Plugin
 * Description: Does example things.
 * Version: 1.2.3
 * Author: Example Author
 * Text Domain: example-plugin
 * Requires at least: 6.0
 * Requires PHP: 8.1
 * License: GPLv2 or later
 */
`
  );
  await writeFile(
    path.join(root, "readme.txt"),
    `=== Example Plugin ===
Contributors: example
Tags: example, tools
Requires at least: 6.0
Tested up to: 6.8
Stable tag: 1.2.3
Requires PHP: 8.1
License: GPLv2 or later

== Description ==
Does example things.
`
  );

  return root;
}
