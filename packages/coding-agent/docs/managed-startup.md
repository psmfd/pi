# Explicit managed startup (PSMFD experiment)

`--startup-policy managed-v1` is an opt-in, keyless startup contract for a
host that selects and verifies the executable and local extensions. It is
experimental and does not change ordinary CLI startup when absent.

The host must replace the child environment, select the real project cwd,
and supply absolute `PI_CODING_AGENT_DIR` and `--session-dir` paths. If
`PI_CODING_AGENT_SESSION_DIR` is present, it must match `--session-dir`.
`--system-prompt` is required and always literal, even when it names an existing
file. Each optional `--extension` must name an absolute regular local file.
Symlinks, duplicate paths, directories and extension load errors fail startup.
The host owns full artifact/extension dependency verification and path isolation.

Use the space-separated selector before startup, for example:

```sh
PI_CODING_AGENT_DIR=/isolated/profile/agent /verified/runtime/pi \
  --startup-policy managed-v1 --mode rpc \
  --session-dir /isolated/profile/sessions \
  --system-prompt 'You are a coding assistant.' \
  --extension /verified/runtime/host-extension.mjs
```

The example shows required inputs; it is not a substitute for constructing a
replacement environment. Do not inherit operator credentials or loader hooks.
Omit `--mode rpc` for interactive mode. Optional compatible switches are
`--no-extensions`, `--no-skills`, `--no-prompt-templates`, `--no-themes`,
`--no-context-files`, `--no-approve`, `--offline`, `--no-tools`,
`--no-builtin-tools`, `--help` and `--version`. The policy enforces its exclusions
without requiring these redundant switches. Other flags/positional input,
unknown policy versions and duplicate options are rejected before configuration
or command dispatch; `--extension` alone may repeat with distinct files.

The policy uses in-memory settings, credentials and model configuration. It
skips migrations, package resolution, automatic resource/context discovery,
first-run setup, helper downloads, keybinding files, custom theme discovery and
background update checks. Built-in themes/assets remain available. Explicit
extension factories run once per runtime creation/reload. The same immutable
resource policy applies to reload and same-cwd new sessions.

Install/config/auth commands and session resume, switch, import, fork and parent
session selection are unsupported. Interactive rejection leaves the current
session usable. These are temporary S3 limits; they do not implement the future
host profile/resume/credential APIs.

This controls startup and resource discovery, not arbitrary filesystem or network
access by tools, prompts, or trusted extensions. It is not an OS sandbox. A host
must never silently fall back to ordinary startup after managed verification fails.

Tracking: [Pi #80](https://github.com/psmfd/pi/issues/80),
[FingerTrap #209](https://github.com/psmfd/FingerTrap/pull/209), and FingerTrap
ADR-0038. Exact production pin selection and product activation are separate
review gates. Qualification uses unpublished artifacts and synthetic state.
