---
sidebar_position: 1
---

# Packaging Rules

Pressship creates a zip with one top-level plugin folder, matching the format expected by WordPress plugin upload.

It excludes common development artifacts by default:

- `.git`
- `.gitignore`
- `.github`
- `.DS_Store`
- `.idea`
- `.vscode`
- `.env`
- `.env.*`
- `.pressship-svn`
- `node_modules`
- `dist`
- `build`
- `coverage`
- `tests`
- `*.log`
- `*.zip`
- `.pressshipignore`
- legacy `.pressportignore`

Add a `.pressshipignore` file in your plugin directory for project-specific exclusions:

```gitignore
assets/**/*.mp4
docs/raw/**
playground/**
```

You can also ignore files per command:

```bash
pressship pack ./my-plugin --ignore "assets/**/*.mp4"
pressship submit ./my-plugin --ignore "assets/**/*.mp4"
pressship publish ./my-plugin --ignore "assets/**/*.mp4"
pressship release ./my-plugin --ignore "assets/**/*.mp4"
```
