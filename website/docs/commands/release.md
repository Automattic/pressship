---
sidebar_position: 9
---

# Release

```bash
pressship release ./my-plugin --slug my-plugin --username WpOrgUser
```

WordPress.org initial review uses a zip upload. Approved plugin releases use SVN. `release` keeps the approved-plugin workflow explicit and is equivalent to `publish --release`.

`release` will:

1. checkout or update `https://plugins.svn.wordpress.org/<slug>`;
2. sync packaged plugin files into `trunk/`;
3. create `tags/<version>` from trunk;
4. show `svn status`;
5. ask for confirmation;
6. commit the release.

## Options

```bash
pressship release ./my-plugin --slug my-plugin
pressship release ./my-plugin --version 1.2.3
pressship release ./my-plugin --username WpOrgUser
pressship release ./my-plugin --message "Release 1.2.3"
pressship release ./my-plugin --ignore "assets/**/*.mp4"
pressship release ./my-plugin --dry-run
pressship release ./my-plugin --yes
```
