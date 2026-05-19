---
sidebar_position: 5
---

# Version

```bash
pressship version patch
pressship version minor ./my-plugin
pressship version major ./my-plugin
```

`version` bumps local plugin metadata, similar to `npm version`.

It updates:

- the main plugin file `Version:` header;
- the `Stable tag:` value in `readme.txt`, when a readme exists.

Examples:

```bash
# 1.2.3 -> 1.2.4
pressship version patch

# 1.2.3 -> 1.3.0
pressship version minor ./my-plugin

# 1.2.3 -> 2.0.0
pressship version major ./my-plugin
```
