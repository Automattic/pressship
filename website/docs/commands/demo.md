---
sidebar_position: 3
---

# Demo

```bash
pressship demo
pressship demo ./my-plugin
pressship demo elementor
pressship demo https://wordpress.org/plugins/elementor/
```

`demo` starts a local WordPress Playground server with the plugin loaded and activated.

For local paths, Pressship mounts the plugin directory into Playground. For hosted slugs or WordPress.org plugin URLs, Pressship creates a Blueprint that installs and activates the plugin from the WordPress.org directory.

Pressship uses the plugin's required WordPress and PHP versions when they are declared. You can override either runtime:

```bash
pressship demo ./my-plugin --wp 6.8 --php 8.3
```

## Options

```bash
pressship demo ./my-plugin --port 9401
pressship demo ./my-plugin --reset
pressship demo ./my-plugin --skip-browser
```

- `--port` chooses the local Playground server port.
- `--reset` removes the persisted Playground site before starting.
- `--skip-browser` starts the server without opening a browser.

Pressship also adds a small Playground compatibility mu-plugin before activation. It loads WordPress admin plugin helpers when plugins expect them and suppresses PHP deprecation notices so demo pages stay readable while real warnings, errors, and fatals still surface.
