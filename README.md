# psmfd/pi

> PSMFD-maintained detached mirror of upstream
> [`earendil-works/pi`](https://github.com/earendil-works/pi).

## Mirror status

This repository is a detached mirror used by PSMFD to build, scan, attest, and
publish PSMFD-owned pi runtime releases from selected upstream source versions.

Important boundaries:

- This is **not** the upstream project.
- This is **not** an official upstream release or support channel.
- Upstream source history and tags are preserved for provenance.
- PSMFD-owned changes are limited to mirror metadata, provenance, security
  policy, and CI/release automation overlays.
- Behavioral source patches are out of scope for this mirror.

## Purpose

This mirror provides a public, auditable repository for PSMFD release work:

- preserving the upstream pi source history used for PSMFD builds;
- documenting the relationship between upstream pi and PSMFD releases;
- recording mirror-specific security and workflow policy;
- keeping upstream GitHub Actions workflows as reference-only material unless
  PSMFD explicitly adapts or adopts them;
- supporting future build, scan, attestation, and publication workflows.

## What differs from upstream?

| Path | Purpose |
|---|---|
| `README.md` | PSMFD public landing page for this detached mirror. |
| `PROVENANCE.md` | Mirror provenance, upstream relationship, and zero-divergence policy. |
| `README.psmfd.md` | Detailed PSMFD mirror notes and automation boundary. |
| `SECURITY.md` | Security reporting and mirror integrity policy. |
| `NOTICE.psmfd.md` | PSMFD notice for mirror-specific overlay content. |
| `.psmfd/security-baseline.md` | Workflow, repository, and public-flip security baseline. |
| `.psmfd/overlay-allowlist.txt` | Paths PSMFD may intentionally modify in this mirror. |
| `.gitleaks.toml` | Secret-scanning configuration for reviewed upstream-history findings. |
| `.github/workflows/psmfd-*.yml/.yaml` | PSMFD-developed, adapted, or adopted workflows. |
| `.github/workflows-upstream-reference/` | Quarantined upstream workflow reference copies. |

Anything outside approved overlay paths is treated as upstream-owned content.
If a sync would require changing upstream source or build files, the sync must
stop for explicit review instead of silently diverging.

## Upstream project

For upstream project documentation, code, issues, and contribution guidance,
use the upstream repository:

- Upstream repository: <https://github.com/earendil-works/pi>
- Upstream README:
  <https://github.com/earendil-works/pi/blob/main/README.md>
- PSMFD provenance: [`PROVENANCE.md`](PROVENANCE.md)

## Security and support

Security concerns specific to PSMFD mirror automation, release artifacts,
provenance, or attestations should follow this repository's
[`SECURITY.md`](SECURITY.md).

General upstream pi product behavior should be reported to the upstream project
unless the issue is caused by PSMFD mirror overlays or PSMFD-published
artifacts. If unsure, start with upstream product support rather than reporting
upstream behavior as a PSMFD mirror vulnerability.

Do not open public issues containing secrets, exploit details, or private
vulnerability information.

## Maintainer notes

- Detailed mirror notes live in [`README.psmfd.md`](README.psmfd.md).
- Mirror provenance and zero-divergence policy live in
  [`PROVENANCE.md`](PROVENANCE.md).
- The current security baseline lives in
  [`.psmfd/security-baseline.md`](.psmfd/security-baseline.md).
- Upstream workflow files under `.github/workflows-upstream-reference/` are
  reference-only and are not active GitHub Actions workflows.

## License

Upstream pi source remains under the upstream project's license. See the root
[`LICENSE`](LICENSE) file and [`NOTICE.psmfd.md`](NOTICE.psmfd.md) for
mirror-specific notice information.
