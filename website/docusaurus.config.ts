import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Pressship",
  tagline: "WordPress.org plugin publishing from the terminal.",
  favicon: "img/pressship-square.png",

  future: {
    v4: true
  },

  url: "https://pressship.org",
  baseUrl: "/",
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
    image: "img/pressship-square.png",
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true
    },
    navbar: {
      logo: {
        alt: "Pressship",
        src: "img/pressship.png",
        srcDark: "img/pressship-dark.png"
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
        },
        {
          title: "WordPress.org",
          items: [
            {
              label: "Plugin Directory",
              href: "https://wordpress.org/plugins/"
            },
            {
              label: "Submit a Plugin",
              href: "https://wordpress.org/plugins/developers/add/"
            },
            {
              label: "Plugin Check",
              href: "https://wordpress.org/plugins/plugin-check/"
            }
          ]
        }
      ],
      copyright: `
        <div class="pp-footer-disclaimer">
          <svg class="pp-wp-mark" viewBox="0 0 122.5 122.5" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path fill="currentColor" d="M8.7,61.3c0,20.8,12.1,38.7,29.6,47.3L13.3,40C10.3,46.5,8.7,53.7,8.7,61.3z M96.4,58.7c0-6.5-2.3-11-4.3-14.5c-2.7-4.3-5.2-8-5.2-12.3c0-4.8,3.7-9.3,8.9-9.3c0.2,0,0.5,0,0.7,0.1c-9.4-8.6-21.9-13.9-35.7-13.9c-18.5,0-34.8,9.5-44.3,23.9c1.2,0,2.4,0.1,3.4,0.1c5.5,0,14.1-0.7,14.1-0.7c2.9-0.2,3.2,4,0.4,4.3c0,0-2.9,0.3-6,0.5l19.1,56.9l11.5-34.5l-8.2-22.4c-2.9-0.2-5.6-0.5-5.6-0.5c-2.9-0.2-2.5-4.5,0.3-4.3c0,0,8.7,0.7,13.9,0.7c5.5,0,14.1-0.7,14.1-0.7c2.9-0.2,3.2,4,0.4,4.3c0,0-2.9,0.3-6,0.5l19,56.5l5.2-17.6C94.6,69.6,96.4,64.4,96.4,58.7z M62.2,65.9l-15.8,46c4.7,1.4,9.7,2.1,14.8,2.1c6.1,0,12-1.1,17.5-3c-0.1-0.2-0.3-0.5-0.4-0.7L62.2,65.9z M107.1,36.2c0.2,1.7,0.4,3.5,0.4,5.5c0,5.4-1,11.5-4.1,19.2L86.9,108c16.1-9.4,26.9-26.8,26.9-46.7C113.9,52,111.5,42.7,107.1,36.2z M61.3,0C27.5,0,0,27.5,0,61.3s27.5,61.3,61.3,61.3c33.8,0,61.3-27.5,61.3-61.3S95,0,61.3,0z M61.3,119.7c-32.2,0-58.4-26.2-58.4-58.4S29.1,2.9,61.3,2.9c32.2,0,58.4,26.2,58.4,58.4S93.5,119.7,61.3,119.7z"/>
          </svg>
          <p>
            <strong>Pressship is an independent, community project.</strong>
            It is not affiliated with, endorsed by, or sponsored by WordPress, WordPress.org,
            the WordPress Foundation, or Automattic. The WordPress&reg; trademark is the property
            of the WordPress Foundation.
          </p>
        </div>
        <div class="pp-footer-copyright">Copyright © ${new Date().getFullYear()} Pressship.</div>
      `
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula
    }
  } satisfies Preset.ThemeConfig
};

export default config;
