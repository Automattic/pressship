---
sidebar_position: 8
---

# Submit

```bash
pressship submit ./my-plugin
```

`submit` is the explicit WordPress.org review upload flow. It is equivalent to `publish --submit`.

It will:

1. discover the plugin main file;
2. parse WordPress plugin headers;
3. parse and validate `readme.txt`;
4. validate `readme.txt` with WordPress.org;
5. build a WordPress-installable zip;
6. stage package contents for Plugin Check;
7. run the official WordPress.org Plugin Check;
8. ask for confirmation when blocking findings are reported;
9. upload the zip to WordPress.org.

If WordPress.org already has a pending submission matching the plugin slug or name, Pressship uses the reupload form instead of the new-plugin form.

## Options

```bash
pressship submit ./my-plugin --dry-run
pressship submit ./my-plugin --no-verify
pressship submit ./my-plugin --skip-plugin-check
pressship submit ./my-plugin --skip-readme-validator
pressship submit ./my-plugin --wp-path /path/to/wordpress
pressship submit ./my-plugin --ignore "assets/**/*.mp4"
pressship submit ./my-plugin --output-dir ./build
pressship submit ./my-plugin --yes
```

Use `--no-verify` only when you intentionally want to skip both readme validation and Plugin Check before uploading. Use `--skip-plugin-check` when you only want to bypass Plugin Check.
