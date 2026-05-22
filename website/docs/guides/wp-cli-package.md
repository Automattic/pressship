---
sidebar_position: 5
---

# WP-CLI Package

Pressship can be installed as a WP-CLI package:

```bash
wp package install f/pressship
```

After installation, run Pressship through WP-CLI:

```bash
wp ship verify ./my-plugin
wp ship pack ./my-plugin
wp ship publish ./my-plugin --dry-run
```

The package is a thin PHP bridge. It forwards arguments to the Node.js Pressship package through `npx`; Pressship's publishing, verification, packaging, browser, and SVN behavior all still live in the Node CLI.

## Requirements

- WP-CLI with package support.
- Node.js 20 or newer.
- npm/npx available on your shell path.

You can override the bridge internals when testing:

```bash
PRESSSHIP_NPX=/path/to/npx wp ship verify ./my-plugin
PRESSSHIP_NPX_PACKAGE=pressship@0.1.9 wp ship verify ./my-plugin
```
