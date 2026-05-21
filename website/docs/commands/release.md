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
2. sync packaged plugin files into `trunk/`;
3. sync `.wordpress-org/` into SVN `assets/` when the folder exists;
4. create `tags/<version>` from trunk;
5. show `svn status`;
6. ask for confirmation;
7. commit the release with a generated WordPress.org SVN password.

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
