---
sidebar_position: 1
---

# Authentication

```bash
pressship login
pressship whoami
pressship whoami --json
pressship logout
```

`login` opens `login.wordpress.org` in a browser. Complete the login manually, including any two-factor prompts. Pressship waits until it detects the logged-in WordPress.org user and then saves the browser session locally.

`whoami` verifies the saved session and prints the current WordPress.org account.

`logout` removes Pressship's saved session. It does not revoke other active WordPress.org sessions.
