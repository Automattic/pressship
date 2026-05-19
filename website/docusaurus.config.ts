import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Pressship",
  tagline: "WordPress.org plugin publishing from the terminal.",
  favicon: "img/pressship.png",

  future: {
    v4: true
  },

  url: "https://blog.fka.dev",
  baseUrl: "/pressship/",
  organizationName: "f",
  projectName: "pressship",
  deploymentBranch: "gh-pages",
  trailingSlash: false,

  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/f/pressship/tree/main/website/"
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      } satisfies Preset.Options
    ]
  ],

  themeConfig: {
    image: "img/pressship.png",
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true
    },
    navbar: {
      logo: {
        alt: "Pressship",
        src: "img/pressship.png"
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs"
        },
        {
          href: "https://github.com/f/pressship",
          label: "GitHub",
          position: "right"
        }
      ]
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Getting Started",
              to: "/docs/getting-started"
            },
            {
              label: "Commands",
              to: "/docs/commands/publish"
            },
            {
              label: "GitHub Pages",
              to: "/docs/guides/github-pages"
            }
          ]
        },
        {
          title: "Project",
          items: [
            {
              label: "GitHub",
              href: "https://github.com/f/pressship"
            }
          ]
        }
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Pressship.`
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula
    }
  } satisfies Preset.ThemeConfig
};

export default config;
