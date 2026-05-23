---
sidebar_position: 6
---

# Studio

```bash
pressship studio
pressship studio --no-open
pressship studio --port 9478
```

`studio` starts Pressship Studio at `127.0.0.1`.

Pressship Studio can:

- list plugins from the saved WordPress.org account;
- remember local plugin paths;
- clone or update WordPress.org SVN checkouts;
- show plugin metadata and readmes;
- open local plugins in a VS Code-style editor;
- stream Playground output into a bottom terminal;
- launch WordPress Playground into a right-side iframe preview;
- detect version state and duplicate SVN tags;
- bump patch, minor, or major versions;
- run dry-run-first submit and release flows with a live job console.

Mutating API requests are guarded by a per-run token embedded in the local page. Confirmed submit and release jobs are only available after a successful dry run.

## Options

```bash
pressship studio --host 127.0.0.1
pressship studio --port 9478
pressship studio --no-open
```
