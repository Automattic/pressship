---
sidebar_position: 6
---

# Pack

```bash
pressship pack ./my-plugin
```

`pack` creates a WordPress-installable `{slug}.zip` without uploading or committing. By default, it writes the zip to the current directory.

Unlike a plain zip command, `pack` validates by default:

- local `readme.txt` metadata;
- the remote WordPress.org readme validator;
- the official WordPress.org Plugin Check.

## Options

```bash
pressship pack ./my-plugin --output-dir ./build
pressship pack ./my-plugin --ignore "assets/**/*.mp4"
pressship pack ./my-plugin --skip-readme-validator
pressship pack ./my-plugin --wp-path /path/to/wordpress
pressship pack ./my-plugin --no-verify
pressship pack ./my-plugin --json
```

Use `--no-verify` only when you intentionally want the zip without readme validation or Plugin Check.
