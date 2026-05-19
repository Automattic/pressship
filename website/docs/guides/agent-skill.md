---
sidebar_position: 4
---

# Agent Publishing Skill

Pressship includes an agent skill for cautious WordPress.org plugin publishing workflows:

```text
.claude/skills/wordpress-plugin-publish/SKILL.md
```

The skill is designed for agents that help maintain plugins with Pressship. It turns the publishing process into a safer checklist instead of a loose sequence of commands.

## Install The Skill

You can install the skill with the open agent skills CLI. First, list the skills exposed by the Pressship repository:

```bash
npx skills add f/pressship --list
```

Install the publishing skill for a specific agent:

```bash
npx skills add f/pressship --skill wordpress-plugin-publish -a claude-code
npx skills add f/pressship --skill wordpress-plugin-publish -a codex
```

For a global, non-interactive install, combine `--global`, `--agent`, and `--yes`:

```bash
npx skills add f/pressship --skill wordpress-plugin-publish --global --agent claude-code --yes
```

Useful `skills add` flags:

- `--list` shows available skills without installing them.
- `--skill wordpress-plugin-publish` installs only Pressship's publishing workflow skill.
- `--agent <name>` targets a compatible agent, such as `claude-code` or `codex`.
- `--global` installs to the user-level skills directory instead of the current project.
- `--yes` skips confirmation prompts for repeatable setup scripts.

See the [skills CLI reference](https://www.skills.sh/docs/cli) for the full option list.

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
