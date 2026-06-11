# PSMFD pi mirror

This repository is a detached mirror of <https://github.com/earendil-works/pi>
used to build, scan, attest, and publish PSMFD-owned pi runtime releases.

## Relationship to upstream

- This is **not** a GitHub fork network fork.
- Upstream source history and tags are preserved.
- PSMFD overlay files are additive and limited to repository metadata,
  documentation, security policy, and CI/release automation.
- Behavioral source patches are out of scope for this mirror.

See [`PROVENANCE.md`](PROVENANCE.md) for the seed commit, trust statement, and
zero-divergence policy.

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
