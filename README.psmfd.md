# PSMFD pi mirror

This repository is a detached mirror of <https://github.com/earendil-works/pi>
used to build, scan, attest, and publish PSMFD-owned pi runtime releases.

The root [`README.md`](README.md) is the concise public landing page for GitHub
visitors. This file carries the detailed PSMFD mirror notes.

## Relationship to upstream

- This is **not** a GitHub fork network fork.
- Upstream source references are recorded; the v0.87.1 squash imported content
  without bringing the upstream tag into `main` ancestry.
- PSMFD overlays cover repository metadata, documentation, security policy, and
  CI/release automation.
- Manifest-tracked security (S-class) and capability (C-class) source patches
  are bounded exceptions to zero divergence. At the 2026-09-29 checkpoint,
  7 S-class and 4 C-class patches remain active.

See [`PROVENANCE.md`](PROVENANCE.md) for the seed commit, trust statement, and
patch policy, measured caps, evidence limits, and next-sync ancestry caveat.

## PSMFD automation boundary

This mirror does not run upstream workflows by default. Upstream workflows are
reference material only; runnable automation must be PSMFD-developed,
PSMFD-adapted, or explicitly PSMFD-adopted.

See [`.psmfd/security-baseline.md`](.psmfd/security-baseline.md) for the
canonical workflow execution policy and pre-public checklist.

## Security

See [`SECURITY.md`](SECURITY.md). This mirror should not contain repository
secrets or long-lived publishing credentials. Workflows should use
least-privilege `GITHUB_TOKEN` permissions and OIDC/keyless signing where
supported.
