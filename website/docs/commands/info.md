---
sidebar_position: 2
---

# Info

```bash
pressship info
pressship info ./my-plugin
pressship info 16deza-table-cell-extras
pressship info https://wordpress.org/plugins/16deza-table-cell-extras/
pressship info --remote
pressship info ./my-plugin --remote
pressship info 16deza-table-cell-extras --json
```

`info` shows detailed metadata for a local plugin path or hosted WordPress.org plugin. With no argument, it inspects the current directory.

For local plugins, it reports headers and readme metadata: version, main file, readme path, text domain, WordPress and PHP requirements, stable tag, tags, contributors, license, and description.

For hosted plugins, it uses the public WordPress.org plugin info API and reports version, author, requirements, active installs, last updated date, rating, support status, tags, description, and download URL.

Use `--remote` to force the hosted WordPress.org plugin-store lookup. When the target is a local path or omitted, Pressship discovers the local plugin slug first, then fetches the WordPress.org store info for that slug.
