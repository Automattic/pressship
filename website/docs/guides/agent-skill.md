---
sidebar_position: 4
---

# Agent Publishing Skill

Pressship includes an agent skill for cautious WordPress.org plugin publishing workflows:

```text
.claude/skills/wordpress-plugin-publish/SKILL.md
```

The skill is designed for agents that help maintain plugins with Pressship. It turns the publishing process into a safer checklist instead of a loose sequence of commands.

## What It Enforces

- Run a dry run before any submit, reupload, or release unless explicitly told otherwise.
- Inspect account, plugin info, and WordPress.org status before choosing a publishing route.
- Keep Plugin Check findings visible instead of hiding them behind automation.
- Use repeatable package exclusions for bulky or source-only files.
- Avoid git commits, pushes, or tags unless the user explicitly asks for them.
- Report exactly what happened at the end of the workflow.

## Suggested Flow

Start by orienting around the current account and plugin state:

```bash
pressship whoami
pressship status .
pressship info .
```

Test the plugin locally when useful:

```bash
pressship demo .
```

Validate and package:

```bash
pressship pack .
```

For review uploads or pending reuploads, dry-run first:

```bash
pressship publish . --dry-run -y
```

Then publish only after the dry run is understood:

```bash
pressship publish . -y
```

For approved plugins, force the release route:

```bash
pressship publish . --release --dry-run -y
pressship publish . --release -y
```

## Final Report Checklist

The skill asks agents to report:

- whether a dry run was run;
- package size and notable included or excluded files;
- Plugin Check result summary;
- upload or release status and slug;
- whether git was left untouched or changed.

This keeps the automation useful without making WordPress.org publishing feel invisible.
