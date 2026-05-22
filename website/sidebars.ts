import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docs: [
    "intro",
    "getting-started",
    {
      type: "category",
      label: "Commands",
      collapsed: false,
      items: [
        "commands/auth",
        "commands/info",
        "commands/list",
        "commands/get",
        "commands/demo",
        "commands/status",
        "commands/version",
        "commands/verify",
        "commands/pack",
        "commands/publish",
        "commands/submit",
        "commands/release"
      ]
    },
    {
      type: "category",
      label: "Guides",
      collapsed: false,
      items: ["guides/packaging", "guides/plugin-check", "guides/agent-skill", "guides/github-pages"]
    },
    "troubleshooting"
  ]
};

export default sidebars;
