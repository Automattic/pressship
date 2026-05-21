---
sidebar_position: 4
---

# List

```bash
pressship ls
pressship list
```

`ls` lists WordPress.org plugins for the saved account or for a public profile username.

Public WordPress.org author archives show plugins where the user is listed as a contributor. When you run `pressship ls` for the saved logged-in account, WordPress.org also includes plugins where that account has SVN committer access.

## Examples

```bash
pressship ls
pressship ls fatihkadirakin
pressship ls --public
pressship ls --json
```

Use `pressship ls` after `pressship login` when you want the release-oriented view of plugins you can commit to.

## Options

```bash
pressship ls [username] --public
pressship ls [username] --json
```
