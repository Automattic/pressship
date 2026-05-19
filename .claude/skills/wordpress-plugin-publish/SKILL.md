---
name: wordpress-plugin-publish
description: Use this skill when publishing, submitting, reuploading, packaging, checking, or releasing WordPress.org plugins with Pressship. It covers safe Pressship workflows for local plugin directories, pending WordPress.org submissions, approved plugin releases, Plugin Check review, package exclusions, WordPress Playground demos, and authentication.
---

# WordPress Plugin Publish

Use Pressship for WordPress.org plugin submission and release work. Prefer `npx pressship` unless the user explicitly wants the local checkout version.

## Safety Rules

- Never publish, submit, reupload, or release without first running a dry run, unless the user explicitly says to skip it.
- Do not push git commits or tags unless the user explicitly asks.
- Report Plugin Check findings clearly. Do not hide them just because Pressship can continue.
- Use repeatable excludes for large or source-only files. Prefer `.pressshipignore` when the project already has one.
- If Pressship prompts interactively, answer only with user-approved or obvious plugin metadata.
- If authentication fails, run `npx pressship login` and let the user complete WordPress.org login.

## Orientation

From the plugin directory:

```bash
npx pressship whoami
npx pressship status .
npx pressship info .
```

Use `status` to determine whether `publish` will target a pending submission reupload or an approved SVN release.

## Local Playground Test

Start a local WordPress Playground with the plugin mounted:

```bash
npx pressship demo .
```

Useful options:

```bash
npx pressship demo . --port 9401
npx pressship demo . --wp 6.8 --php 8.3
npx pressship demo . --reset
npx pressship demo . --skip-browser
```

## Package Check

Create and validate a WordPress-installable zip without uploading:

```bash
npx pressship pack .
```

For projects with bulky assets or source-only files, pass explicit ignores:

```bash
npx pressship pack . --ignore "assets/**" --ignore "src/**" --ignore "node_modules/**"
```

Inspect package file count and included paths. Make sure the ZIP contains runtime PHP, built assets, `readme.txt`, and any required examples or static assets.

## Submit Or Reupload Pending Review

Use this for new plugins or WordPress.org submissions still awaiting review.

Dry run first:

```bash
npx pressship publish . --dry-run -y
```

Then upload:

```bash
npx pressship publish . -y
```

When the project contains large non-distribution directories, repeat the same ignore flags in both commands:

```bash
npx pressship publish . --dry-run -y \
  --ignore "assets/**" \
  --ignore "src/**" \
  --ignore "scripts/**" \
  --ignore "package.json" \
  --ignore "package-lock.json" \
  --ignore ".github/**" \
  --ignore "node_modules/**" \
  --ignore "dist/**"

npx pressship publish . -y \
  --ignore "assets/**" \
  --ignore "src/**" \
  --ignore "scripts/**" \
  --ignore "package.json" \
  --ignore "package-lock.json" \
  --ignore ".github/**" \
  --ignore "node_modules/**" \
  --ignore "dist/**"
```

After upload, confirm:

```bash
npx pressship status .
```

## Release Approved Plugin

Use this only when the plugin is already approved and the user wants a WordPress.org release.

Dry run first:

```bash
npx pressship publish . --release --dry-run -y
```

Then release:

```bash
npx pressship publish . --release -y
```

If Pressship cannot infer the slug or username:

```bash
npx pressship release . --slug my-plugin --username WpOrgUser --dry-run
npx pressship release . --slug my-plugin --username WpOrgUser -y
```

## Version Bumps

Only run version bumps when the user asks:

```bash
npx pressship version patch .
npx pressship version minor .
npx pressship version major .
```

After a version bump, review changed plugin headers, `readme.txt` stable tag, and changelog.

## Final Report

Always include:

- Whether a dry run was run.
- Package size and notable included/excluded files.
- Plugin Check result summary.
- Upload/release status and slug.
- Whether git was left untouched or changed.
