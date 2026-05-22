---
sidebar_position: 2
---

# Getting Started

## Requirements

- Node.js 20 or newer.
- A WordPress.org account.
- Internet access for browser login, Plugin Check setup, and WordPress Playground demos.
- PHP when Pressship needs to prepare a managed Plugin Check environment.
- `svn` for approved-plugin releases and `get` checkouts. If it is missing, Pressship can detect your OS and offer to install Subversion.

## Authenticate

```bash
npx pressship login
npx pressship whoami
```

`login` opens WordPress.org in a real browser and stores only the browser session state locally. Pressship does not store your WordPress.org password.

## Inspect A Plugin

```bash
npx pressship info ./my-plugin
npx pressship status ./my-plugin
```

`info` reads local plugin metadata or hosted WordPress.org plugin details. `status` reads the logged-in WordPress.org developer page for submitted-plugin review state.

## Package And Validate

```bash
npx pressship verify ./my-plugin
npx pressship pack ./my-plugin
```

`verify` validates `readme.txt` and runs Plugin Check without creating an artifact. `pack` runs the same checks and writes a WordPress-installable `{slug}.zip` to the current directory.

## Publish

```bash
npx pressship publish ./my-plugin --dry-run
npx pressship publish ./my-plugin
```

`publish` chooses the right WordPress.org path:

- pending or reuploadable review submissions use the submit flow;
- approved plugins with SVN use the release flow;
- ambiguous cases ask you to choose.

Use `--submit` or `--release` when you want to be explicit.

## Demo Locally

```bash
npx pressship demo ./my-plugin
npx pressship demo elementor
```

`demo` starts WordPress Playground with the plugin installed and activated. Local plugins are mounted into the Playground instance so code edits are immediately available.
