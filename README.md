<p align="center">
  <img src="assets/pressship.png" alt="Pressship" width="400">
</p>

<p align="center">
  A modern CLI for preparing, validating, submitting, and releasing WordPress.org plugins from the terminal.
</p>

<p align="center">
  <a href="https://nodejs.org/"><img alt="Node.js 20+" src="https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white"></a>
  <a href="https://wordpress.org/plugins/developers/"><img alt="WordPress.org Plugin Directory" src="https://img.shields.io/badge/WordPress.org-plugin%20directory-3858e9?logo=wordpress&logoColor=white"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

<p align="center">
  <strong>A modernized publishing workflow for WordPress.org plugins.</strong>
</p>

It is designed to modernize WordPress plugin publishing while keeping WordPress.org review and SVN release behavior explicit:

```bash
npx pressship login
npx pressship publish ./my-plugin --dry-run
npx pressship publish ./my-plugin
```

If you use agent skills, install Pressship's publishing workflow skill:

```bash
npx skills add f/pressship --skill wordpress-plugin-publish -a codex
```

For other agents, replace `codex` with the target agent name, such as `claude-code`. To inspect available skills first, run:

```bash
npx skills add f/pressship --list
```

## Why Pressship?

Publishing a WordPress plugin to WordPress.org involves a lot of small steps: creating the right zip, validating `readme.txt`, running Plugin Check, logging into WordPress.org, uploading through the developer page, and later publishing releases through SVN.

Pressship automates that workflow while still using WordPress.org's existing review and release systems.

## Features

- Browser-based WordPress.org login with saved local session state.
- `whoami` and `logout` commands for session management.
- Plugin discovery from WordPress plugin headers.
- `readme.txt` parsing and local validation.
- WordPress.org readme validator automation.
- WordPress-installable zip generation.
- Modernized `publish` and `pack` commands.
- Managed WordPress.org Plugin Check setup and execution.
- Current WordPress.org submission state inspection.
- Local and hosted plugin info lookup.
- Local WordPress Playground demos for plugin paths or hosted slugs.
- Playground runtime selection from plugin WordPress/PHP requirements.
- Quieter Playground demos with deprecation noise suppressed.
- Pending-plugin reupload support via the WordPress.org developer page.
- SVN release workflow for approved plugins.
- Repeatable ignore globs and `.pressshipignore` support.
- Documentation site for GitHub Pages.
- Colorful CLI output with progress indicators.

## Quick Start

```bash
# Authenticate with WordPress.org.
npx pressship login

# Confirm the saved account.
npx pressship whoami

# Inspect current submitted plugin state.
npx pressship status ./my-plugin

# Inspect local plugin metadata or hosted WordPress.org plugin info.
npx pressship info ./my-plugin
npx pressship info 16deza-table-cell-extras

# Open a local WordPress Playground demo.
npx pressship demo ./my-plugin
npx pressship demo 16deza-table-cell-extras

# Validate and package without uploading or committing.
npx pressship publish ./my-plugin --dry-run

# Submit for review, reupload a pending plugin, or release an approved plugin.
npx pressship publish ./my-plugin
```

You can still use the explicit WordPress.org review and SVN flows:

```bash
npx pressship submit ./my-plugin
npx pressship release ./my-plugin --slug my-plugin --username WpOrgUser
```

## Requirements

- Node.js 20 or newer.
- A WordPress.org account.
- Internet access for first-run browser and Plugin Check setup.
- PHP for Pressship's managed Plugin Check environment when system WP-CLI is unavailable.
- `svn` for approved-plugin `pressship publish --release` and `pressship release`.

Pressship installs Playwright Chromium automatically when browser automation first needs it.

## Command Overview

```bash
pressship login
pressship whoami [--json]
pressship logout
pressship info [slug-or-path] [--json]
pressship demo [slug-or-path] [options]
pressship status [plugin-path-or-slug] [--json]
pressship version <patch|minor|major> [plugin-path]
pressship pack [plugin-path] [options]
pressship publish [plugin-path] [options]
pressship submit [plugin-path] [options]
pressship release [plugin-path] [options]
```

## Login Flow

```bash
pressship login
```

Pressship opens `login.wordpress.org` in a real browser. Complete login manually, including any two-factor or account checks. Pressship waits until it detects a logged-in WordPress.org user, saves the browser session locally, and closes the browser.

Pressship does not store your WordPress.org password.

Useful commands:

```bash
pressship whoami
pressship whoami --json
pressship logout
```

## Info Flow

```bash
pressship info
pressship info ./my-plugin
pressship info 16deza-table-cell-extras
pressship info https://wordpress.org/plugins/16deza-table-cell-extras/
pressship info 16deza-table-cell-extras --json
```

`info` shows detailed metadata for a local plugin path or hosted WordPress.org plugin. With no argument, it inspects the current directory.

For local plugins it reports headers and readme metadata, including version, main file, readme path, text domain, requirements, stable tag, tags, contributors, and description.

For hosted plugins it uses the public WordPress.org plugin info API and reports version, author, requirements, active installs, last updated date, rating, support status, tags, description, and download URL.

## Demo Flow

```bash
pressship demo
pressship demo ./my-plugin
pressship demo 16deza-table-cell-extras
pressship demo https://wordpress.org/plugins/16deza-table-cell-extras/
```

`demo` starts a local WordPress Playground server with the plugin loaded and activated. For local paths, Pressship mounts the plugin directory into Playground so local code changes are available. For hosted slugs or WordPress.org plugin URLs, Pressship creates a Blueprint that installs and activates the plugin from the WordPress.org directory.

Pressship uses the plugin's required WordPress and PHP versions when they are declared; pass `--wp` or `--php` to override them. It also adds a small Playground compatibility mu-plugin before activation so plugins that expect WordPress admin plugin helpers can boot cleanly. PHP deprecation notices are suppressed in demo pages, while real warnings, errors, and fatal errors remain visible.

Useful options:

```bash
pressship demo ./my-plugin --port 9401
pressship demo ./my-plugin --wp 6.8 --php 8.3
pressship demo ./my-plugin --reset
pressship demo ./my-plugin --skip-browser
```

Under the hood, `demo` uses the official `@wp-playground/cli` package. The Playground server keeps running until you stop it with `Ctrl+C`.

## Status Flow

```bash
pressship status
pressship status ./my-plugin
pressship status my-plugin
pressship status my-plugin --json
```

`status` reads the logged-in WordPress.org developer page and reports the current state of submitted plugins.

For pending submissions it can show:

- Review status.
- Assigned slug.
- Plugin ID.
- Submitted zip filename.
- Submitted version.
- Upload date.
- Plugin Check URL.
- Whether slug change is available.
- Whether updated zip upload is available.

When given a local plugin path, Pressship discovers the plugin headers and uses the inferred slug/name to find the matching WordPress.org submission.

Example output:

```text
Pressmind
  Status       Awaiting Review — This plugin has not yet been reviewed.
  Slug         pressmind
  Submitted    May 14, 2026
  Plugin ID    313331
  Reupload     available
  Slug change  available
  File         pressmind.zip
  Version      0.0.3
```

## Version Flow

```bash
pressship version patch
pressship version minor ./my-plugin
pressship version major ./my-plugin
```

`version` bumps local plugin metadata from the command line.

It updates:

- The main plugin file `Version:` header.
- The `Stable tag:` value in `readme.txt`, when a readme exists.

Examples:

```bash
# 1.2.3 -> 1.2.4
pressship version patch

# 1.2.3 -> 1.3.0
pressship version minor ./my-plugin

# 1.2.3 -> 2.0.0
pressship version major ./my-plugin
```

## Publish Flow

```bash
pressship publish ./my-plugin
```

`publish` is the modernized happy path. It discovers the plugin and then chooses the best WordPress.org publishing flow:

- Use `submit` when a matching WordPress.org review submission is pending or reuploadable.
- Use `release` when the plugin has an approved WordPress.org SVN repository and no pending review submission is found.
- Ask whether to submit or release when Pressship cannot confidently choose.

Useful options:

```bash
pressship publish ./my-plugin --dry-run
pressship publish ./my-plugin --submit
pressship publish ./my-plugin --release --username WpOrgUser
pressship publish ./my-plugin --skip-plugin-check
pressship publish ./my-plugin --skip-readme-validator
pressship publish ./my-plugin --wp-path /path/to/wordpress
pressship publish ./my-plugin --ignore "assets/**/*.mp4"
pressship publish ./my-plugin --yes
```

Use `--submit` for the review-upload flow and `--release` for the approved-plugin SVN flow when you want to be explicit.

## Pack Flow

```bash
pressship pack ./my-plugin
```

`pack` validates the plugin, runs Plugin Check, and creates the WordPress-installable `{slug}.zip` without uploading or committing. By default, it writes the zip to the current directory.

Useful options:

```bash
pressship pack ./my-plugin --output-dir ./build
pressship pack ./my-plugin --ignore "assets/**/*.mp4"
pressship pack ./my-plugin --skip-readme-validator
pressship pack ./my-plugin --wp-path /path/to/wordpress
pressship pack ./my-plugin --no-validate
pressship pack ./my-plugin --json
```

Use `--no-validate` only when you intentionally want to create the zip without readme validation or Plugin Check.

## Submit Flow

```bash
pressship submit ./my-plugin
```

`submit` is the explicit WordPress.org review preparation flow. It is equivalent to `publish --submit`:

1. Discover the plugin main file.
2. Parse WordPress plugin headers.
3. Parse and validate `readme.txt`.
4. Validate `readme.txt` with the WordPress.org readme validator.
5. Build a WordPress-installable zip.
6. Stage package contents for Plugin Check.
7. Run the official WordPress.org Plugin Check.
8. Ask for confirmation when blocking findings are reported.
9. Upload the zip to WordPress.org.

If WordPress.org already has a pending submission matching the plugin slug or name, Pressship uses the "Upload updated plugin for review" form instead of the new-plugin form.

Useful options:

```bash
pressship submit ./my-plugin --dry-run
pressship submit ./my-plugin --skip-plugin-check
pressship submit ./my-plugin --skip-readme-validator
pressship submit ./my-plugin --wp-path /path/to/wordpress
pressship submit ./my-plugin --ignore "assets/**/*.mp4"
pressship submit ./my-plugin --ignore "assets/**/*.mp4" --ignore "docs/raw/**"
pressship submit ./my-plugin --output-dir ./build
pressship submit ./my-plugin --yes
```

## Managed Plugin Check

By default, Pressship prepares its own local Plugin Check environment in your user config cache.

It can automatically:

- Use system WP-CLI when available.
- Download `wp-cli.phar` when system WP-CLI is unavailable.
- Download WordPress core.
- Create a managed `wp-config.php`.
- Install SQLite Database Integration for a local database-free setup.
- Run `wp core install` against the SQLite-backed local WordPress install.
- Download the WordPress.org Plugin Check plugin.
- Load Plugin Check with the required WP-CLI bootstrap file.

This means most users can run:

```bash
pressship submit ./my-plugin --dry-run
```

without manually installing WordPress, WP-CLI, MySQL, or the Plugin Check plugin.

If you already have a local WordPress install with Plugin Check available, pass it explicitly:

```bash
pressship submit ./my-plugin --wp-path /path/to/wordpress
```

## Release Flow

```bash
pressship release ./my-plugin --slug my-plugin --username WpOrgUser
```

WordPress.org initial review uses a zip upload. Approved plugin releases use SVN. Pressship keeps those workflows separate. `release` is equivalent to `publish --release`.

`release` will:

1. Checkout or update `https://plugins.svn.wordpress.org/<slug>`.
2. Sync packaged plugin files into `trunk/`.
3. Create `tags/<version>` from trunk.
4. Show `svn status`.
5. Ask for confirmation.
6. Commit the release.

Useful options:

```bash
pressship release ./my-plugin --slug my-plugin
pressship release ./my-plugin --version 1.2.3
pressship release ./my-plugin --username WpOrgUser
pressship release ./my-plugin --message "Release 1.2.3"
pressship release ./my-plugin --ignore "assets/**/*.mp4"
pressship release ./my-plugin --dry-run
pressship release ./my-plugin --yes
```

## Packaging Rules

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
pressship submit ./my-plugin --ignore "assets/**/*.mp4"
pressship publish ./my-plugin --ignore "assets/**/*.mp4"
pressship pack ./my-plugin --ignore "assets/**/*.mp4"
pressship release ./my-plugin --ignore "assets/**/*.mp4"
```

## Configuration And Cache

Pressship stores local state under your user config directory:

```text
~/.config/pressship/
```

This includes:

- WordPress.org browser session storage.
- Debug screenshots for failed browser automation.
- Managed Plugin Check cache.
- Managed WordPress core and SQLite setup.
- Generated Playground demo blueprints.

You can override the config directory:

```bash
PRESSSHIP_CONFIG_DIR=/tmp/pressship pressship status
```

For migration compatibility, `PRESSPORT_CONFIG_DIR` is still accepted as a fallback.

## Troubleshooting

### Browser Runtime Missing

Pressship installs Chromium automatically. If that fails, run:

```bash
npx playwright install chromium
```

For local development:

```bash
Run the `browsers:install` package script.
```

### Not Logged In

Run:

```bash
pressship login
pressship whoami
```

If the saved session is stale:

```bash
pressship logout
pressship login
```

### Plugin Check Setup Problems

The managed Plugin Check environment is automatic, but it still needs PHP and internet access on first run.

To bypass Plugin Check:

```bash
pressship submit ./my-plugin --skip-plugin-check
```

To use your own WordPress install:

```bash
pressship submit ./my-plugin --wp-path /path/to/wordpress
```

### WordPress.org Form Changes

The WordPress.org submission and reupload flows are browser automation over the logged-in developer page, not a documented public API. If WordPress.org changes the form, Pressship fails loudly and saves a debug screenshot under the config directory.

## Documentation Site

The documentation site lives in `website/`.

Run it locally:

```bash
Run the `docs:dev` package script.
```

Build the static site:

```bash
Run the `docs:build` package script.
```

Preview the production build:

```bash
Run the `docs:serve` package script.
```

GitHub Pages deployment is configured in `.github/workflows/docs.yml`. In the repository settings, set Pages to use GitHub Actions as the source.

## Development

```bash
Install dependencies with your preferred Node package manager, then run:

- `dev -- --help`
- `typecheck`
- `test`
- `build`
- `docs:build`
```

Run local commands without publishing:

```bash
Run these through the `dev` package script:

- `login`
- `whoami`
- `status`
- `pack ./my-plugin`
- `publish ./my-plugin --dry-run`
- `submit ./my-plugin --dry-run`
- `release ./my-plugin --dry-run`
```

Package smoke test:

```bash
Use your package manager's dry-run pack command.
```

## Security Notes

- Pressship does not store your WordPress.org password.
- Login is completed in a real browser.
- Pressship stores Playwright browser session state locally.
- `logout` removes Pressship's saved local browser session.
- `logout` does not revoke other active WordPress.org sessions.

## License

MIT
