---
sidebar_position: 99
---

# Troubleshooting

## Browser Runtime Missing

Pressship installs Chromium automatically. If that fails, run:

```bash
npx playwright install chromium
```

For local development:

```bash
Run the `browsers:install` package script.
```

## Not Logged In

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

## Plugin Check Setup Problems

The managed Plugin Check environment is automatic, but it still needs PHP and internet access on first run.

To bypass Plugin Check:

```bash
pressship submit ./my-plugin --skip-plugin-check
```

To use your own WordPress install:

```bash
pressship submit ./my-plugin --wp-path /path/to/wordpress
```

## Playground Demo Noise

`demo` suppresses PHP deprecation notices so demo pages are readable. Real warnings, errors, and fatal errors are still shown.

Use `--reset` when a persisted Playground site is stale:

```bash
pressship demo ./my-plugin --reset
```

## WordPress.org Form Changes

The WordPress.org submission and reupload flows are browser automation over the logged-in developer page, not a documented public API. If WordPress.org changes the form, Pressship fails loudly and saves a debug screenshot under the config directory.
