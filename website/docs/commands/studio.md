---
sidebar_position: 6
---

# Studio

Pressship Studio is the local web workspace for day-to-day WordPress plugin work. It brings the plugin list, local project registry, file editor, Plugin Check, WordPress Playground, AI assistance, SVN release preparation, and guarded publish flows into one browser UI.

```bash
pressship studio
```

By default Studio binds to `127.0.0.1`, opens your browser, and keeps running until you stop the terminal process with `Ctrl+C`.

## Start Studio

```bash
pressship studio
pressship studio --no-open
pressship studio --host 127.0.0.1
pressship studio --port 9478
```

Options:

- `--no-open` starts the server without opening a browser.
- `--host <host>` changes the bind host. The default is `127.0.0.1`.
- `--port <port>` chooses the Studio server port.

Studio uses the same Pressship config directory as the CLI. You can see the active WordPress.org account, config directory, and current working directory on the Settings screen.

## Requirements

Studio can open without a saved WordPress.org session, but the WordPress.org plugin list, review state, clone actions, and release credentials depend on `pressship login`.

For the full experience, have these available:

- a saved WordPress.org session from `pressship login`;
- local plugin folders with a valid plugin header;
- `svn` for approved-plugin checkout, tag, switch, and release workflows;
- WordPress Playground dependencies managed by `pressship demo`;
- optional AI assistants such as Claude Code, Codex CLI, GitHub Copilot CLI, Cursor, Gemini CLI, OpenCode, or WP Studio.

## Dashboard

The Dashboard is the starting point. It shows local plugins, WordPress.org plugins, running Playgrounds, account state, and AI assistant state.

Use it when you want to:

- open a plugin in Studio;
- add a local plugin folder;
- refresh local or WordPress.org plugin lists;
- jump to release management;
- see whether AI assistance is enabled and ready;
- inspect live internal job output when Debug mode is enabled.

## Local Library

The Local Library stores local plugin paths in Studio's registry. Adding a plugin does not copy files. Studio records the path and reads plugin metadata from that folder each time it refreshes.

Local plugins can be opened in the editor, checked, previewed in Playground, version-bumped, and published through dry-run-first workflows.

Removing a plugin from the Local Library only removes the saved Studio entry. It does not delete files from disk.

## WordPress.org Plugins

The WordPress.org screen lists plugins attached to the saved WordPress.org account.

From there you can:

- inspect hosted metadata and readmes;
- clone or update a plugin SVN checkout into the default checkout directory;
- open an existing local checkout in Studio;
- compare remote plugin state with local library entries.

The default checkout directory is configured in Settings and defaults to `~/.pressship/plugins`.

## Opening a Workspace

Use the Studio screen to open a tracked local plugin or choose a local plugin folder. A local workspace includes:

- a file tree for editable plugin files;
- a Monaco-powered editor;
- Home and WP Admin Playground tabs;
- a bottom terminal for job output;
- a right sidebar for AI assistance and release operations.

Remote WordPress.org plugins can be opened read-only when Studio only has hosted metadata. Clone the plugin first when you need to edit files or run local checks.

## Editing Files

Studio opens local plugin files in an editor and keeps edits in the selected plugin directory.

The editor supports:

- file tree navigation;
- dirty-file indicators;
- save actions;
- Plugin Check markers;
- AI patch badges on changed files;
- resizable file, terminal, and sidebar panels.

If you switch files with unsaved changes, Studio asks before discarding the current draft.

## Plugin Check

The Check action runs WordPress.org Plugin Check for the opened local plugin. Results are saved in Studio state and shown as:

- summary counts for errors, warnings, and info;
- file and line hints where possible;
- editor markers;
- check notes that can jump to the relevant file and line;
- release validation state.

Running Plugin Check again replaces the saved results. Saving or accepting AI patches can prune stale findings for changed files.

## WordPress Playground

The Play action starts a local WordPress Playground server for the opened plugin and streams output into the Studio terminal.

Studio provides tabs for:

- `Home`, the public site preview;
- `WP Admin`, with `admin` / `password` shown when a Playground is running;
- the editor tab for the selected file.

When a plugin declares a `Tested up to` version, Studio asks whether to run the latest WordPress or the tested version. Very old WordPress versions may be blocked because they are not supported by the Playground runtime.

Playground settings include:

- a port range, defaulting to `9500` through `9599`;
- database mode: `auto`, `sqlite`, or `mysql`;
- optional MySQL host, port, user, password, and database prefix.

In `auto` mode, Studio uses SQLite for supported WordPress versions and can use MySQL for legacy versions. When managed MySQL is needed, Pressship can use Docker or OrbStack.

## AI Assistance

AI assistance is configured in Settings. Studio detects available Harness providers and shows each provider's status.

Supported assistants include:

- Claude Code;
- Codex CLI;
- GitHub Copilot CLI;
- Cursor;
- Gemini CLI;
- OpenCode;
- WP Studio.

When you send a prompt, Studio does not let the assistant edit your plugin folder directly. It creates a temporary review workspace, passes the current plugin path, selected file, and saved Plugin Check context to the assistant, then compares the temporary workspace against your real plugin.

If the assistant changes files, Studio shows proposed patches. You can review each changed file and accept or reject patches one by one.

AI assistance is most useful after running Plugin Check because the prompt includes the saved check summary and findings.

## Release Management

Studio has release controls in two places:

- the Release Management dashboard view for all local plugins;
- the Release sidebar inside an opened local plugin workspace.

Release management shows version state, duplicate-tag state, readme stable tag state, and publish readiness. It helps catch common release blockers before you run a real publish.

The Release sidebar can:

- read local and remote SVN tags;
- show whether the current working copy is on `trunk` or a tag;
- create a local uncommitted SVN tag from `trunk`;
- delete local-only uncommitted tags;
- switch the working copy between `trunk` and tags;
- run Plugin Check;
- inspect version state;
- run dry-run submit, dry-run release, or auto dry-run;
- confirm a real submit or release after a successful dry run.

Studio refuses to delete remote-published tags. Published tags must be handled through explicit SVN workflows outside the local-only tag cleanup path.

## Dry-Run-First Publishing

Studio publish and release actions are intentionally guarded.

The flow is:

1. Open a local plugin.
2. Run Plugin Check or inspect existing findings.
3. Review version state.
4. Run a dry run: submit, release, or auto.
5. Review the detected route, validation result, package summary, and release plan.
6. Confirm the real action only after the dry run succeeds.

Confirmed publish approvals expire after about 20 minutes. If the plugin version changes after a dry run, Studio requires a fresh dry run before publishing.

For SVN releases, Studio uses the same generated WordPress.org SVN password flow as the CLI. If credentials are missing, run a CLI release once or save credentials before confirming releases from Studio.

## Settings

Settings are stored per user in the Pressship config directory.

Available settings:

- Default checkout directory for WordPress.org SVN clones.
- AI assistant selection.
- Default publish action: auto, submit, or release.
- Default version bump: patch, minor, or major.
- Playground port range.
- Playground database mode and MySQL connection settings.
- Auto-refresh interval for plugin lists.
- Confirmation prompts for destructive or release actions.
- Debug mode for the Activity panel.

Use `0` for the auto-refresh interval to disable automatic refresh.

## Local Files and State

Studio stores local state under the Pressship config directory, normally `~/.config/pressship`.

Important files include:

- `wordpress-org-storage.json` for the saved WordPress.org browser session;
- `svn-credentials.json` for saved generated SVN passwords;
- `studio-local-plugins.json` for the local plugin registry;
- `studio-settings.json` for Studio settings;
- `studio-plugin-check-state.json` for saved Plugin Check findings;
- `cache/` for temporary Studio packages and support files.

Settings and registries are written with user-only file permissions where possible.

## Security Model

Studio is designed as a local tool.

- It binds to `127.0.0.1` by default.
- Each server run generates a token for mutating API requests.
- Job event streams also require the token.
- Confirmed publish and release jobs require a successful dry run.
- AI work happens in a temporary review workspace before patches can be accepted into the real plugin folder.
- Local file edits stay in the selected plugin directory.

Avoid binding Studio to a public network interface unless you are intentionally exposing it on a trusted network.

## Troubleshooting

If WordPress.org plugins do not load, run `pressship login` again and restart Studio.

If release actions complain about SVN, install Subversion or use the CLI with `--no-install-svn` when you do not want Pressship to offer installation help.

If AI assistance says an assistant is missing, install or authenticate that assistant, then click Refresh in Settings.

If Cursor is shown as needing login, set `CURSOR_API_KEY` before starting Studio.

If Playground cannot find a port, expand the port range in Settings or stop old Playground processes.

If a confirmed publish button disappears or reports an expired approval, run a fresh dry run. This is expected protection against stale release state.
