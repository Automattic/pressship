---
sidebar_position: 4
---

# Status

```bash
pressship status
pressship status ./my-plugin
pressship status my-plugin
pressship status my-plugin --json
```

`status` reads the logged-in WordPress.org developer page and reports the current review state for submitted plugins.

For pending submissions, it can show the review status, assigned slug, plugin ID, submitted zip filename, submitted version, upload date, Plugin Check URL, slug-change availability, and reupload availability.

When given a local plugin path, Pressship discovers plugin headers and uses the inferred slug/name to find the matching WordPress.org submission.
