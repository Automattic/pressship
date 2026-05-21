---
sidebar_position: 2
---

# Managed Plugin Check

By default, Pressship prepares its own local Plugin Check environment in your user config cache.

It can automatically:

- use system WP-CLI when available;
- download `wp-cli.phar` when system WP-CLI is unavailable;
- download WordPress core;
- create a managed `wp-config.php`;
- install SQLite Database Integration;
- run `wp core install` against the SQLite-backed local WordPress install;
- download the WordPress.org Plugin Check plugin;
- load Plugin Check with the required WP-CLI bootstrap file.

This means most users can run:

```bash
pressship submit ./my-plugin --dry-run
```

without manually installing WordPress, WP-CLI, MySQL, or the Plugin Check plugin.

If you already have a local WordPress install with Plugin Check available, pass it explicitly:

```bash
pressship submit ./my-plugin --wp-path /path/to/wordpress
pressship pack ./my-plugin --wp-path /path/to/wordpress
pressship release ./my-plugin --wp-path /path/to/wordpress
```

To skip only Plugin Check during submit-style uploads:

```bash
pressship submit ./my-plugin --skip-plugin-check
```

To bypass both readme validation and Plugin Check before publishing or releasing through SVN:

```bash
pressship publish ./my-plugin --no-verify
pressship release ./my-plugin --no-verify
```
