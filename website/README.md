# Pressship Documentation

This directory contains the Docusaurus documentation site for Pressship.

## Local Development

From the repository root:

```bash
npm run docs:dev
```

Or from this directory:

```bash
npm start
```

## Build

From the repository root:

```bash
npm run docs:build
```

Or from this directory:

```bash
npm run build
```

The generated static site is written to `website/build`.

## Deployment

GitHub Pages deployment is handled by `.github/workflows/docs.yml`. Configure the repository Pages source to use GitHub Actions.
