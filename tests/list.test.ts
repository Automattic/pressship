import { describe, expect, it } from "vitest";
import { parsePluginArchiveHtml } from "../src/plugin/list.js";

describe("WordPress.org plugin listing", () => {
  it("parses plugin cards and roles from an author archive", () => {
    const plugins = parsePluginArchiveHtml(
      `
      <li class="wp-block-post plugin type-plugin plugin_contributors-evster plugin_committers-fatihkadirakin">
        <div class="plugin-card">
          <header class="entry-header">
            <h3 class="entry-title"><a href="https://wordpress.org/plugins/list-all-urls/">List all URLs</a></h3>
          </header>
          <span class="plugin-author"><svg></svg><span>Evan Scheingross</span></span>
          <span class="active-installs"><svg></svg><span>4,000+ active installations</span></span>
          <span class="tested-with"><svg></svg><span>Tested with 6.8.5</span></span>
        </div>
      </li>
      <li class="wp-block-post plugin type-plugin plugin_contributors-fatihkadirakin">
        <div class="plugin-card">
          <header class="entry-header">
            <h3 class="entry-title"><a href="//wordpress.org/plugins/example-plugin/">Example Plugin</a></h3>
          </header>
        </div>
      </li>
      `,
      "fatihkadirakin"
    );

    expect(plugins).toEqual([
      {
        name: "List all URLs",
        slug: "list-all-urls",
        url: "https://wordpress.org/plugins/list-all-urls/",
        author: "Evan Scheingross",
        activeInstalls: "4,000+ active installations",
        testedWith: "Tested with 6.8.5",
        roles: ["committer"]
      },
      {
        name: "Example Plugin",
        slug: "example-plugin",
        url: "https://wordpress.org/plugins/example-plugin/",
        author: undefined,
        activeInstalls: undefined,
        testedWith: undefined,
        roles: ["contributor"]
      }
    ]);
  });
});
