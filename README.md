<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/pressship-square-dark.png">
    <img src="assets/pressship-square.png" alt="Pressship" width="120" />
  </picture>
</p>

<h1 align="center">Pressship</h1>

<p align="center">
  <em>WordPress.org plugin publishing, from the terminal.</em>
</p>

<p align="center">
  <a href="https://nodejs.org/"><img alt="Node.js 20+" src="https://img.shields.io/badge/node-%3E%3D20-1e293b?logo=node.js&logoColor=white&style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/pressship"><img alt="npm" src="https://img.shields.io/npm/v/pressship?color=3858e9&logo=npm&logoColor=white&style=flat-square" /></a>
  <a href="https://wordpress.org/plugins/developers/"><img alt="WordPress.org" src="https://img.shields.io/badge/WordPress.org-plugin%20directory-21759b?logo=wordpress&logoColor=white&style=flat-square" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3858e9?style=flat-square" /></a>
  <a href="https://github.com/Automattic/pressship"><img alt="GitHub stars" src="https://img.shields.io/github/stars/Automattic/pressship?style=flat-square&logo=github&color=1e293b" /></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#commands">Commands</a> ·
  <a href="#managed-plugin-check">Managed Plugin Check</a> ·
  <a href="#agent-skill">Agent skill</a> ·
  <a href="https://pressship.org">Docs</a>
</p>

---

Pressship is a modern command-line tool for the entire WordPress.org plugin publishing lifecycle — validating, packaging, submitting for review, releasing through SVN, inspecting submission state, and even booting your plugin in [WordPress Playground](https://wordpress.org/playground/).

It keeps WordPress.org-specific behavior **explicit** and makes everything around it **quiet**.

```bash
npx pressship publish ./my-plugin
```

## Why Pressship?

Publishing a WordPress plugin to WordPress.org normally means juggling a lot of small things: the right zip layout, `readme.txt` validation, Plugin Check setup, the developer-page upload form, then SVN for releases. Pressship automates the chores while keeping the official WordPress.org review and SVN release behavior intact.

If you've used `npm publish`, this should feel familiar.

## Quick start

```bash
# 1. Authenticate with WordPress.org
npx pressship login

# 2. (Optional) Verify the saved session
npx pressship whoami

# 3. Verify the plugin without packaging or uploading
npx pressship verify ./my-plugin

# 4. Submit for review or release an approved plugin
npx pressship publish ./my-plugin
```

That's it. Pressship handles browser-based login, packaging, readme validation, Plugin Check, and routing between submission and SVN release.

## Features

- **Browser-based login** — opens `login.wordpress.org` in a real browser and saves only the session locally. Your password is never read or stored.
- **Smart `publish`** — automatically routes between new-plugin review submission, pending reupload, or SVN release.
- **Zero-setup Plugin Check** — bundles its own managed WordPress + SQLite + Plugin Check environment when you don't already have WP-CLI.
- **WordPress.org readme validator** — runs the official validator before you upload anything.
- **Submission state inspector** — reads the logged-in developer page to surface review status, slug, reupload availability, and Plugin Check links.
- **SVN release workflow** — handles checkout, trunk sync, tag creation, and commit.
- **WordPress Playground demos** — boot any local path or hosted slug in Playground using the plugin's own WP/PHP requirements.
- **Pressship Studio** — a local VS Code-style workspace with file tabs, Playground previews, AI assistance, release management, package-size checks, and CLI command hints in the terminal.
- **`.pressshipignore` + glob ignores** — sensible defaults, easy per-command overrides.
- **Agent skill included** — a Pressship publishing skill for coding agents (Codex, Claude Code, etc.).
- **Beautiful terminal UX** — colored output, progress indicators, structured findings.

## Requirements

- **Node.js 20+**
- A **WordPress.org account**
- **Internet access** for first-run browser and Plugin Check setup
- **PHP** when Pressship needs to prepare its managed Plugin Check environment
- **`svn`** for approved-plugin releases and `get` checkouts. If it is missing, Pressship can detect your OS and offer to install Subversion with Homebrew, apt, dnf, yum, pacman, zypper, apk, winget, or Chocolatey.

Playwright Chromium is installed automatically the first time browser automation runs.

## Commands

| Command | What it does |
| ------- | ------------ |
| `pressship login` | Open WordPress.org login in a browser and save the session. |
| `pressship whoami` | Show the active WordPress.org account. |
| `pressship logout` | Remove the saved WordPress.org session. |
| `pressship info` | Inspect local plugin metadata or hosted WordPress.org plugin info. |
| `pressship ls` | List plugins for the saved account or a public WordPress.org profile. |
| `pressship get` | Checkout or update a WordPress.org plugin SVN working copy. |
| `pressship studio` | Start Pressship Studio for plugin operations, editing, and Playground previews. |
| `pressship status` | Read review state from the logged-in developer dashboard. |
| `pressship version <patch\|minor\|major>` | Bump the plugin header version and readme stable tag together. |
| `pressship verify` | Run readme validation and Plugin Check without creating a zip. |
| `pressship pack` | Validate, run Plugin Check, and write an installable zip. |
| `pressship publish` | Route to submit or release based on current state. |
| `pressship submit` | Upload a zip to WordPress.org review (or reupload). |
| `pressship release` | Push an approved release through SVN trunk + tags. |
| `pressship demo` | Open the plugin in WordPress Playground. |

Get help for any command:

```bash
pressship <command> --help
```

## WP-CLI Package

Pressship can also be installed as a WP-CLI package:

```bash
wp package install Automattic/pressship
```

That adds a `wp ship` command:

```bash
wp ship verify ./my-plugin
wp ship pack ./my-plugin
wp ship publish ./my-plugin --dry-run
```

The WP-CLI package is intentionally a thin PHP bridge. It forwards arguments to the Node.js Pressship package through `npx`, so the publishing logic stays in one place. Node.js 20+ and npm/npx are still required.

## Authentication

```bash
pressship login
```

Opens `login.wordpress.org` in a real browser. Complete the login manually — Pressship waits until it detects a logged-in user, then saves only the browser session state.

```bash
pressship whoami          # Print the active account
pressship whoami --json   # Machine-readable output
pressship logout          # Remove the local session
```

> Pressship never reads, transmits, or stores your WordPress.org password.

## Publishing

`publish` is the modern, opinionated happy path. It inspects your plugin and routes to the right flow:

- A pending WordPress.org review submission → **reupload**.
- A new plugin Pressship hasn't seen → **submit for review**.
- An approved plugin with an SVN repository → **release**.
- Ambiguous? Pressship asks.

```bash
pressship publish ./my-plugin              # Pick the right flow automatically
pressship publish ./my-plugin --dry-run    # Validate + package, no upload
pressship publish ./my-plugin --submit     # Force review submission
pressship publish ./my-plugin --release    # Force SVN release
pressship publish ./my-plugin --no-verify  # Skip readme validation + Plugin Check
pressship publish ./my-plugin --yes        # Skip confirmation prompts
pressship publish ./my-plugin --release --no-install-svn
```

Before uploading or committing an SVN release, `publish` verifies the plugin with readme validation and Plugin Check. Use `--no-verify` only when you intentionally want to bypass those checks.

Need fine-grained control? Use the explicit subcommands `submit` and `release`.

## Packaging

```bash
pressship verify ./my-plugin
```

Runs readme validation and Plugin Check without writing a zip or publishing anything.

```bash
pressship verify ./my-plugin --ignore "assets/**/*.mp4"
pressship verify ./my-plugin --skip-readme-validator
pressship verify ./my-plugin --wp-path /path/to/wordpress
pressship verify ./my-plugin --json
```

```bash
pressship pack ./my-plugin
```

Validates the plugin, runs Plugin Check, and writes `{slug}.zip` — without uploading. Useful for CI artifacts or manual uploads.

```bash
pressship pack ./my-plugin --output-dir ./build
pressship pack ./my-plugin --ignore "assets/**/*.mp4"
pressship pack ./my-plugin --no-verify
pressship pack ./my-plugin --json
```

### Ignore rules

Default exclusions: `.git`, `.gitignore`, `.github`, `.DS_Store`, `.idea`, `.vscode`, `.env*`, `.pressship-svn`, `node_modules`, `dist`, `build`, `coverage`, `tests`, `*.log`, `*.zip`.

Add per-project exclusions in a `.pressshipignore` file (same syntax as `.gitignore`):

```gitignore
assets/**/*.mp4
docs/raw/**
playground/**
```

Or pass `--ignore <glob>` directly (repeat as needed):

```bash
pressship publish ./my-plugin --ignore "assets/**/*.mp4" --ignore "docs/raw/**"
```

## Listing WordPress.org plugins

```bash
pressship ls                  # Saved account, including SVN committer plugins
pressship ls fatihkadirakin   # Public profile plugins for a username
pressship ls --public         # Force the public profile view
pressship ls --json
```

`ls` reads WordPress.org's plugin author archive. Public archives show plugins where the user is listed as a contributor. When you run `pressship ls` for the saved logged-in account, WordPress.org also includes plugins where that account has SVN committer access.

## Getting a plugin SVN working copy

```bash
pressship get list-all-urls
pressship get list-all-urls ./plugins/list-all-urls
pressship get https://wordpress.org/plugins/list-all-urls/ ./list-all-urls
pressship get list-all-urls --json
pressship get list-all-urls --no-install-svn
```

`get` checks out `https://plugins.svn.wordpress.org/<slug>` into the destination directory. If the destination already contains an SVN working copy, Pressship runs `svn update` instead. After checkout or update, it prints repository details such as revision, last changed revision, trunk/assets availability, and tag count.

If `svn` is not available, Pressship detects your operating system and package manager, then asks before installing Subversion. Use `--no-install-svn` to skip the installer helper and fail with manual instructions.

### Editing an approved plugin from SVN

WordPress.org SVN working copies keep editable plugin code in `trunk/`, and published versions in `tags/<version>/`. A typical release flow is:

```bash
pressship get my-plugin ./my-plugin
cd ./my-plugin
# edit files in trunk/
pressship version patch
pressship publish
```

When Pressship runs from the SVN checkout root, it treats `trunk/` as the plugin directory, bumps the version there, and routes `publish` to the SVN release flow.

## Pressship Studio

```bash
pressship studio
pressship studio --no-open
pressship studio --port 9478
```

`studio` starts a localhost-only Pressship Studio workspace. It lists plugins from the saved WordPress.org session, remembers local plugin paths, clones and updates WordPress.org SVN checkouts, shows plugin metadata and readmes, opens local plugins in a VS Code-style editor, streams Playground output into the Studio terminal, previews Playground in an iframe, checks package size, manages `.pressshipignore`, checks version state, bumps patch/minor/major versions, and runs dry-run-first publish/release flows.

Studio also prints the equivalent `npx pressship ...` command in its terminal for CLI-backed actions such as Playground, Plugin Check, package size, version bumps, and publish dry runs.

By default it binds to `127.0.0.1`, generates a per-run token for mutating API requests, and uses the same local Pressship config directory as the CLI.

## Inspecting submission state

```bash
pressship status                 # All submitted plugins
pressship status ./my-plugin     # Match by local plugin
pressship status my-plugin       # Match by slug
pressship status my-plugin --json
```

Sample output:

```
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

## Plugin metadata

```bash
pressship info                                 # Current directory
pressship info ./my-plugin                     # Local path
pressship info 16deza-table-cell-extras        # Hosted slug
pressship info --remote                        # Hosted info for the current plugin slug
pressship info ./my-plugin --json
```

For local plugins, Pressship parses headers and readme metadata. For hosted plugins it queries the official WordPress.org plugin info API. Use `--remote` to force the hosted plugin-store lookup from a local path or the current directory.

## Version bumping

```bash
pressship version patch     # 1.2.3 → 1.2.4
pressship version minor     # 1.2.3 → 1.3.0
pressship version major     # 1.2.3 → 2.0.0
```

Updates the `Version:` header in the main plugin file **and** the `Stable tag:` in `readme.txt` together.

## Playground demos

```bash
pressship demo ./my-plugin                # Mount local plugin into Playground
pressship demo 16deza-table-cell-extras   # Install hosted plugin from WP.org
```

Pressship boots a local [WordPress Playground](https://wordpress.org/playground/) server with the plugin installed and activated. For local paths the plugin directory is mounted, so code changes are immediately reflected.

```bash
pressship demo ./my-plugin --port 9401
pressship demo ./my-plugin --wp 6.8 --php 8.3
pressship demo ./my-plugin --reset
pressship demo ./my-plugin --skip-browser
```

The Playground server keeps running until you stop it with `Ctrl+C`.

## Managed Plugin Check

By default, Pressship runs the official [WordPress.org Plugin Check](https://wordpress.org/plugins/plugin-check/) against your plugin before uploading. If you don't already have WP-CLI installed, Pressship sets up its own managed environment automatically:

1. Detects (or downloads) WP-CLI.
2. Downloads WordPress core.
3. Sets up SQLite Database Integration (no MySQL required).
4. Runs `wp core install` against the SQLite-backed site.
5. Installs the WordPress.org Plugin Check plugin.
6. Bootstraps it with the correct `--require` flag.

All cached under `~/.config/pressship/`.

If you'd rather use your own install:

```bash
pressship publish ./my-plugin --wp-path /path/to/wordpress
```

For submit-style uploads, you can skip only Plugin Check while still running readme validation:

```bash
pressship publish ./my-plugin --skip-plugin-check
```

To bypass both readme validation and Plugin Check before publishing or releasing through SVN:

```bash
pressship publish ./my-plugin --no-verify
```

## Releasing through SVN

For approved plugins:

```bash
pressship release ./my-plugin
```

Pressship will:

1. Verify the plugin with readme validation and Plugin Check.
2. Checkout or update `https://plugins.svn.wordpress.org/<slug>`.
3. Confirm the local version has not already been released as `tags/<version>`.
4. Sync packaged plugin files into `trunk/`.
5. Sync `.wordpress-org/` assets into the SVN `assets/` directory when that folder exists.
6. Create `tags/<version>` from `trunk/`.
7. Show `svn status` and ask before committing.
8. Commit with `--no-auth-cache` and a generated WordPress.org SVN password.

Use `--no-verify` to skip readme validation and Plugin Check before the SVN release.

If the SVN tag already exists, Pressship stops with a “No version change detected” message instead of publishing the same version again.

For commits, Pressship uses the saved WordPress.org login to infer your SVN username. If no SVN password is saved yet, it points you to your WordPress.org SVN password page:

```text
https://profiles.wordpress.org/<username>/profile/edit/group/3/?screen=svn-password
```

Generate the password there, paste it into Pressship once, and it will be stored locally under `~/.config/pressship/svn-credentials.json` for future releases.

```bash
pressship release ./my-plugin --slug my-plugin
pressship release ./my-plugin --version 1.2.3
pressship release ./my-plugin --username WpOrgUser
pressship release ./my-plugin --message "Release 1.2.3"
pressship release ./my-plugin --wp-path /path/to/wordpress
pressship release ./my-plugin --dry-run
pressship release ./my-plugin --no-verify
pressship release ./my-plugin --yes
pressship release ./my-plugin --no-install-svn
```

## Agent skill

Pressship ships with a publishing skill for coding agents (Codex, Claude Code, etc.). It teaches your agent to publish WordPress plugins cautiously — dry-run first, state-aware, with a final review step before any upload.

```bash
npx skills add Automattic/pressship --skill wordpress-plugin-publish -a codex
```

Replace `codex` with another supported agent name, e.g. `claude-code`. List available skills first:

```bash
npx skills add Automattic/pressship --list
```

## Configuration

Pressship stores local state under your user config directory:

```
~/.config/pressship/
```

Contents:

- WordPress.org browser session storage
- Saved WordPress.org SVN passwords for release commits
- Debug screenshots from failed browser automation
- Managed Plugin Check cache (WP-CLI phar, WordPress core, SQLite, Plugin Check plugin)
- Generated Playground demo blueprints

Override the location:

```bash
PRESSSHIP_CONFIG_DIR=/tmp/pressship pressship status
```

> `PRESSPORT_CONFIG_DIR` is still respected as a legacy fallback.

## Documentation

Full docs live at **<https://pressship.org>**.

The source is in [`website/`](./website) and runs as a standard Docusaurus site:

```bash
npm run docs:dev      # Local dev server
npm run docs:build    # Production build
npm run docs:serve    # Preview production build
```

GitHub Pages deployment is wired up in [`.github/workflows/docs.yml`](.github/workflows/docs.yml).

## Development

```bash
npm install
npm run dev -- --help     # Run the CLI locally
npm run typecheck
npm test
npm run build
```

Try local commands without publishing the package:

```bash
npm run dev -- login
npm run dev -- whoami
npm run dev -- pack ./my-plugin
npm run dev -- publish ./my-plugin --dry-run
```

Package smoke test:

```bash
npm pack --dry-run
```

## Troubleshooting

<details>
<summary><strong>Browser runtime missing</strong></summary>

Pressship installs Chromium automatically. If that fails:

```bash
npx playwright install chromium
```
</details>

<details>
<summary><strong>Session expired or not logged in</strong></summary>

```bash
pressship logout
pressship login
```
</details>

<details>
<summary><strong>Plugin Check setup problems</strong></summary>

The managed environment needs PHP and internet access on first run. To bypass:

```bash
pressship publish ./my-plugin --skip-plugin-check
```

To use your own WordPress install:

```bash
pressship publish ./my-plugin --wp-path /path/to/wordpress
```
</details>

<details>
<summary><strong>WordPress.org form changes</strong></summary>

The submission flow is browser automation over the logged-in developer page (not a documented public API). If WordPress.org changes the form, Pressship fails loudly and saves a debug screenshot under `~/.config/pressship/debug/`.
</details>

## Security

- Pressship **never stores your WordPress.org password**.
- Login is completed in a real browser by you.
- Playwright browser session state is stored locally for WordPress.org browser automation.
- If you run an SVN release, Pressship can store the generated WordPress.org SVN password locally so future commits can run non-interactively.
- `pressship logout` removes the local browser session; it does **not** revoke other active WordPress.org sessions.

## Contributing

Issues, ideas, and pull requests are welcome. Please open an issue first for larger changes so we can discuss the direction.

When opening a PR, please:

- Add or update relevant tests (`npm test`).
- Run `npm run typecheck` and `npm run build`.
- Keep new commands consistent with the existing CLI patterns.

## Acknowledgements

Pressship is built on the work of many people and projects:

- [WordPress.org](https://wordpress.org/) and the plugin review team
- [WP-CLI](https://wp-cli.org/) and [Plugin Check](https://github.com/WordPress/plugin-check)
- [SQLite Database Integration](https://github.com/WordPress/sqlite-database-integration)
- [WordPress Playground](https://wordpress.org/playground/)
- [Playwright](https://playwright.dev/) for browser automation
- [Docusaurus](https://docusaurus.io/) for the documentation site

## Disclaimer

**Pressship is an independent, community project.** It is not affiliated with, endorsed by, or sponsored by WordPress, WordPress.org, the WordPress Foundation, or Automattic. The WordPress® trademark is the property of the WordPress Foundation.

## License

[MIT](LICENSE) © Pressship contributors
