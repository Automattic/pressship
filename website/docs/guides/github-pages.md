---
sidebar_position: 3
---

# GitHub Pages

The documentation site lives in `website/` and is built with Docusaurus.

## Local Development

From the repository root:

```bash
npm run docs:dev
```

Build the static site:

```bash
npm run docs:build
```

Serve the generated site locally:

```bash
npm run docs:serve
```

## Deployment

The repository includes `.github/workflows/docs.yml`, which builds `website/` and publishes the generated Docusaurus output to GitHub Pages.

In GitHub, set **Settings -> Pages -> Build and deployment -> Source** to **GitHub Actions**.

The Docusaurus config is set for this repository:

```ts
url: "https://blog.fka.dev",
baseUrl: "/pressship/",
organizationName: "f",
projectName: "pressship",
deploymentBranch: "gh-pages",
trailingSlash: false,
```

If the repository moves, update those values in `website/docusaurus.config.ts`.
