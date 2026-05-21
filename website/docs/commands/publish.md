---
sidebar_position: 7
---

# Publish

```bash
pressship publish ./my-plugin
```

`publish` is the modernized happy path for WordPress.org plugins. It discovers the plugin and chooses the best publishing flow:

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
pressship publish ./my-plugin --release --no-install-svn
```

Use `--submit` for review upload and `--release` for approved-plugin SVN release when you want to force the route.

For SVN releases, Pressship can infer the username from the saved WordPress.org login. On the first real release commit, it will ask for a generated WordPress.org SVN password and save it locally for later releases.

When the selected release version already exists in SVN as `tags/<version>`, Pressship stops with a “No version change detected” message. Bump the plugin version before publishing again.

If `svn` is missing during a release, Pressship can detect your operating system and ask before installing Subversion. Use `--no-install-svn` to skip that helper.
