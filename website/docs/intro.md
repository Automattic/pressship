---
sidebar_position: 1
---

# Pressship

Pressship is a CLI for preparing, validating, submitting, releasing, inspecting, and demoing WordPress.org plugins from the terminal.

It keeps WordPress.org-specific behavior explicit while making the common path feel closer to npm package publishing:

```bash
npx pressship login
npx pressship publish ./my-plugin --dry-run
npx pressship publish ./my-plugin
```

## What Pressship Handles

- Browser-based WordPress.org login and local session storage.
- Plugin discovery from WordPress plugin headers.
- `readme.txt` parsing and WordPress.org readme validation.
- Managed WordPress.org Plugin Check setup.
- WordPress-installable zip generation.
- Smart `publish` routing between review submission and SVN release.
- Explicit `submit` and `release` commands for WordPress.org workflows.
- `info`, `status`, and `demo` commands for inspection and local testing.

Pressship does not replace WordPress.org review or SVN. It automates the steps around them.
