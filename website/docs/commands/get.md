---
sidebar_position: 5
---

# Get

```bash
pressship get list-all-urls
```

`get` checks out or updates a WordPress.org plugin SVN repository.

By default, Pressship checks out to `./<slug>`:

```bash
pressship get list-all-urls
```

Pass a destination when you want another directory:

```bash
pressship get list-all-urls ./plugins/list-all-urls
pressship get https://wordpress.org/plugins/list-all-urls/ ./list-all-urls
```

If the destination already contains an SVN working copy, Pressship runs `svn update` instead of checking out again. If the directory exists and is not an SVN working copy, Pressship stops and asks you to choose another path.

If `svn` is missing, Pressship detects your operating system and package manager, then asks before installing Subversion. It can use Homebrew on macOS, common Linux package managers, winget, or Chocolatey.

## Editing From SVN

WordPress.org SVN working copies keep the editable plugin code in `trunk/`, with published versions stored under `tags/<version>/`.

```bash
pressship get my-plugin ./my-plugin
cd ./my-plugin
# edit files in trunk/
pressship version patch
pressship publish
```

When Pressship runs from the SVN checkout root, it treats `trunk/` as the plugin directory. `version` updates the plugin header and readme in `trunk/`, and `publish` routes to the SVN release flow.

After checkout or update, Pressship prints repository details:

- SVN URL
- working copy path
- current revision
- last changed revision and author
- whether `trunk/`, `assets/`, and `tags/` are present
- tag count

## Options

```bash
pressship get list-all-urls --json
pressship get list-all-urls --no-install-svn
```
