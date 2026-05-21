---
sidebar_position: 9
---

# Release

```bash
pressship release ./my-plugin --slug my-plugin
```

WordPress.org initial review uses a zip upload. Approved plugin releases use SVN. `release` keeps the approved-plugin workflow explicit and is equivalent to `publish --release`.

If `svn` is missing, Pressship detects your operating system and package manager, then asks before installing Subversion. Use `--no-install-svn` when you want it to fail with manual install instructions instead.

`release` will:

1. checkout or update `https://plugins.svn.wordpress.org/<slug>`;
2. confirm the local version has not already been released as `tags/<version>`;
3. sync packaged plugin files into `trunk/`;
4. sync `.wordpress-org/` into SVN `assets/` when the folder exists;
5. create `tags/<version>` from trunk;
6. show `svn status`;
7. ask for confirmation;
8. commit the release with a generated WordPress.org SVN password.

If the SVN tag already exists, Pressship stops with a “No version change detected” message. Bump the plugin version before publishing again.

When running from a working copy created by `pressship get`, Pressship uses `trunk/` as the plugin directory and the checkout root as the SVN working copy:

```bash
pressship get my-plugin ./my-plugin
cd ./my-plugin
pressship version patch
pressship publish
```

## SVN Password

Pressship infers the SVN username from the saved WordPress.org login when possible. If no SVN password has been saved yet, it will direct you to:

```text
https://profiles.wordpress.org/<username>/profile/edit/group/3/?screen=svn-password
```

Generate the password there, paste it into Pressship once, and it will be saved locally at `~/.config/pressship/svn-credentials.json` for future release commits.

## Options

```bash
pressship release ./my-plugin --slug my-plugin
pressship release ./my-plugin --version 1.2.3
pressship release ./my-plugin --username WpOrgUser
pressship release ./my-plugin --message "Release 1.2.3"
pressship release ./my-plugin --ignore "assets/**/*.mp4"
pressship release ./my-plugin --dry-run
pressship release ./my-plugin --yes
pressship release ./my-plugin --no-install-svn
```
