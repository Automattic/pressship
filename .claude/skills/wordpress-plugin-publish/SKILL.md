---
name: wordpress-plugin-publish
description: Use this skill when publishing, submitting, reuploading, verifying, packaging, checking, demoing, or releasing WordPress.org plugins with Pressship. It covers safe Pressship workflows for local plugin directories, WordPress.org SVN checkouts, pending submissions, approved releases, Plugin Check review, package exclusions, WordPress Playground demos, WP-CLI usage, and authentication.
---

# WordPress Plugin Publish

Use Pressship for WordPress.org plugin submission and release work. Prefer `npx pressship` unless the user explicitly wants the local checkout version or the WP-CLI package (`wp ship`).

## Install Surfaces

Use the install surface the user asks for:

```bash
npx pressship verify .
wp package install f/pressship
wp ship verify .
npm install -g pressship
pressship verify .
```

For agent skill installation:

```bash
npx skills add f/pressship --skill wordpress-plugin-publish -a codex
npx skills add f/pressship --skill wordpress-plugin-publish -a claude-code
```

## Safety Rules

- Never publish, submit, reupload, or release without first running a dry run, unless the user explicitly says to skip it.
- Do not push git commits or tags unless the user explicitly asks.
- Report Plugin Check findings clearly. Do not hide them just because Pressship can continue.
- Use repeatable excludes for large or source-only files. Prefer `.pressshipignore` when the project already has one.
- Use `--no-verify` only when the user explicitly asks to bypass readme validation and Plugin Check.
- If Pressship prompts interactively, answer only with user-approved or obvious plugin metadata.
- If authentication fails, run `npx pressship login` and let the user complete WordPress.org login.
- For approved-plugin SVN releases, expect Pressship to verify before SVN changes, reject already-published versions, and ask for a generated WordPress.org SVN password when needed.

## Orientation

From the plugin directory:

```bash
npx pressship whoami
npx pressship verify .
npx pressship status .
npx pressship info .
npx pressship info --remote
```

Use `status` to determine whether `publish` will target a pending submission reupload or an approved SVN release.
Use `verify` when you need readme validation and Plugin Check without creating a zip.

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

## Verify And Package

Run the publishing checks without creating a zip:

```bash
npx pressship verify .
```

Create a validated WordPress-installable zip without uploading:

```bash
npx pressship pack .
```

For projects with bulky assets or source-only files, pass explicit ignores:

```bash
npx pressship pack . --ignore "assets/**" --ignore "src/**" --ignore "node_modules/**"
```

`pack`, `publish`, `submit`, and SVN `release` verify by default. If the user explicitly chooses to bypass checks, use the unified flag:

```bash
npx pressship pack . --no-verify
npx pressship publish . --no-verify
```

Inspect package file count and included paths. Make sure the ZIP contains runtime PHP, built assets, `readme.txt`, and any required examples or static assets. Confirm `.pressship-svn` is never included.

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

For an existing WordPress.org plugin, the normal SVN-based edit flow is:

```bash
npx pressship get my-plugin ./my-plugin
cd ./my-plugin
npx pressship version patch
npx pressship publish --release --dry-run -y
npx pressship publish --release -y
```

Pressship treats the SVN checkout root as the project root and edits `trunk/`. It should stop with "No version change detected" if the target tag already exists.

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

If `svn` is missing, let Pressship detect the OS and offer installation, or pass `--no-install-svn` only when the user wants manual setup. If the SVN password is missing, Pressship points to the user's WordPress.org SVN password page and saves the generated password locally after they provide it.

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
- Whether `verify` ran and whether validation was bypassed.
- Package size and notable included/excluded files.
- Plugin Check result summary.
- Upload/release status and slug.
- SVN checkout/tag status for approved releases.
- Whether git was left untouched or changed.
