---
sidebar_position: 3
---

# GitHub Pages

The documentation site lives in `website/`.

## Local Development

From the repository root:

```bash
Run the `docs:dev` package script.
```

Build the static site:

```bash
Run the `docs:build` package script.
```

Serve the generated site locally:

```bash
Run the `docs:serve` package script.
```

## Deployment

The repository includes `.github/workflows/docs.yml`, which builds `website/` and publishes the generated static output to GitHub Pages.

In GitHub, set **Settings -> Pages -> Build and deployment -> Source** to **GitHub Actions**.

The site config is set for this repository:

```ts
url: "https://blog.fka.dev",
baseUrl: "/pressship/",
organizationName: "f",
projectName: "pressship",
deploymentBranch: "gh-pages",
trailingSlash: false,
```

If the repository moves, update those values in `website/docusaurus.config.ts`.
