---
sidebar_position: 1
---

# Pressship

Pressship is a CLI and agent runbook for preparing, validating, submitting, releasing, inspecting, and demoing WordPress.org plugins.

The fastest way to use it with an agent is to hand the agent a bounded prompt that points at the live runbook:

```text
Fetch https://pressship.org/ai and use Pressship to prepare this WordPress plugin for publishing. Run verify and a publish dry run first. Ask before uploading, committing to SVN, or changing git.
```

The same workflow is also available from the terminal:

```bash
npx pressship login
npx pressship publish ./my-plugin --dry-run
npx pressship publish ./my-plugin
```

Pressship keeps WordPress.org-specific behavior explicit while giving people and agents the same modernized publishing path.

## Prompt Examples

Use these prompts as starting points when you want an agent to work inside a plugin repository.

### Inspect Before Publishing

```text
Fetch https://pressship.org/ai and inspect this WordPress plugin with Pressship. Run whoami, status, info, verify, and a publish dry run. Summarize the selected route, Plugin Check results, package size, and any blockers. Do not upload anything or change git.
```

### Prepare A New Submission

```text
Fetch https://pressship.org/ai and prepare this plugin for a first WordPress.org submission. Run verify and a publish dry run, explain what would be uploaded, list any readme or Plugin Check issues, and stop before the real upload.
```

### Release An Approved Plugin

```text
Fetch https://pressship.org/ai and prepare an approved WordPress.org plugin release. Check the current plugin state, run verify, run a release dry run, report the SVN trunk and tag actions Pressship would take, and ask before committing to SVN.
```

### Use Studio To Fix Plugin Check

```text
Fetch https://pressship.org/ai, open Pressship Studio for this plugin, run Plugin Check, and use the saved findings to propose a minimal fix plan. Do not edit files, commit git changes, upload, or release until I approve the plan.
```

For reusable agent setup, install the [Agent Publishing Skill](./guides/agent-skill). For the human-readable runbook, open the [agent endpoint](/ai).

## What Pressship Handles

- Browser-based WordPress.org login and local session storage.
- Plugin discovery from WordPress plugin headers.
- `readme.txt` parsing and WordPress.org readme validation.
- Managed WordPress.org Plugin Check setup.
- Standalone `verify` checks before packaging or publishing.
- WordPress-installable zip generation.
- Smart `publish` routing between review submission and SVN release.
- Explicit `submit` and `release` commands for WordPress.org workflows.
- `get` and `ls` commands for WordPress.org plugin SVN and account visibility.
- Subversion detection with guided install paths when `svn` is missing.
- `info`, `status`, and `demo` commands for inspection and local testing.

Pressship does not replace WordPress.org review or SVN. It automates the steps around them.
