---
sidebar_position: 7
---

# Publish

```bash
pressship publish ./my-plugin
```

`publish` is the npm-style happy path for WordPress.org plugins. It discovers the plugin and chooses the best publishing flow:

- use `submit` when a matching WordPress.org review submission is pending or reuploadable;
- use `release` when the plugin has an approved WordPress.org SVN repository and no pending review submission is found;
- ask whether to submit or release when Pressship cannot confidently choose.

## Options

```bash
pressship publish ./my-plugin --dry-run
pressship publish ./my-plugin --submit
pressship publish ./my-plugin --release --username WpOrgUser
pressship publish ./my-plugin --skip-plugin-check
pressship publish ./my-plugin --skip-readme-validator
pressship publish ./my-plugin --wp-path /path/to/wordpress
pressship publish ./my-plugin --ignore "assets/**/*.mp4"
pressship publish ./my-plugin --yes
```

Use `--submit` for review upload and `--release` for approved-plugin SVN release when you want to force the route.
