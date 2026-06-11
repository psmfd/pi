# PSMFD mirror security baseline

This document records the security baseline for the private `psmfd/pi` mirror.
The mirror preserves upstream files for review and provenance. GitHub Actions
remain disabled until runnable workflow policy is fully configured and verified.

## Workflow execution surface

GitHub Actions workflows are executable automation for this repository. Treat
workflow YAML as an execution surface, not as passive documentation.

Upstream workflows are retained for provenance and reference only. They are not
an approved execution surface for this repository. Only workflows developed by
PSMFD, adapted by PSMFD, or explicitly adopted by PSMFD after review may be
enabled or run.

Workflow classifications:

| Classification | May run? | Meaning |
|---|---:|---|
| PSMFD-developed | Yes | Created by PSMFD for this mirror. |
| PSMFD-adapted | Yes, after review | Derived from another source and changed for this mirror. |
| PSMFD-adopted | Yes, after review | Accepted without material changes after review. |
| Upstream-reference | No | Preserved only for provenance or migration context. |

Before public release, every workflow file must be classified and any runnable
workflow must appear in `.psmfd/workflow-allowlist.yml` or an equivalent approval
record.

## Current baseline

- Repository visibility: private during bootstrap.
- GitHub Actions: disabled at the repository level.
- Default `GITHUB_TOKEN` permissions: read-only.
- Active workflow directory policy: `.github/workflows/` is reserved for PSMFD
  workflows whose filenames start with `psmfd-`.
- Upstream workflow reference directory:
  `.github/workflows-upstream-reference/`.

## Dependabot scope

Dependabot is limited to the `github-actions` ecosystem for this mirror until a
separate dependency policy is approved. Do not enable package-manager update
PRs for upstream-owned lockfiles without an explicit upstream-sync decision.

## Pre-public checklist

Before making `psmfd/pi` public:

- [ ] Inventory every `.github/workflows/*.yml` and
  `.github/workflows/*.yaml` file.
- [ ] Confirm every active workflow is PSMFD-developed, PSMFD-adapted, or
  explicitly PSMFD-adopted.
- [ ] Confirm upstream-reference workflows are unable to run in this repository.
- [ ] Confirm every runnable workflow appears in
  `.psmfd/workflow-allowlist.yml` or an equivalent approval record.
- [ ] Confirm no reference-only workflow is required by branch protection,
  release automation, or repository rules.
- [ ] Confirm runnable workflows use least-privilege permissions and do not
  require long-lived repository secrets.
- [ ] Confirm public README/provenance docs link to this security baseline.
- [ ] Confirm branch protection requires the intended PSMFD checks only.
- [ ] Confirm repository Actions settings allow only the intended execution
  surface.
