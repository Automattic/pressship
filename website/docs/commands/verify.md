---
sidebar_position: 6
---

# Verify

```bash
npx pressship verify ./my-plugin
```

`verify` runs Pressship's publishing checks without creating a zip, uploading a submission, or touching SVN.

It checks:

- local `readme.txt` metadata;
- the remote WordPress.org readme validator;
- the official WordPress.org Plugin Check.

The command exits with a non-zero status when blocking findings are reported.

## Options

```bash
pressship verify ./my-plugin --ignore "assets/**/*.mp4"
pressship verify ./my-plugin --skip-readme-validator
pressship verify ./my-plugin --wp-path /path/to/wordpress
pressship verify ./my-plugin --json
```
