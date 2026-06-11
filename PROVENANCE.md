# PSMFD mirror provenance

This repository is a detached public mirror of the upstream pi source
repository:

- Upstream: <https://github.com/earendil-works/pi>
- Mirror owner: PSMFD
- Mirror repository: <https://github.com/psmfd/pi>
- Seed commit: `406a2214aa1dce746a1902605daf04e6727349dc`
- Seed source branch: upstream `main`

## Trust statement

PSMFD preserves upstream source history and builds selected releases from that
source with an additional build-and-attest pipeline. PSMFD does **not** claim
authorship of upstream commits or retroactively vouch for upstream commit
signatures.

PSMFD-owned commits are limited to mirror overlay files: documentation,
security policy, repository metadata, and CI/release workflows used to build,
scan, attest, and publish PSMFD release artifacts.

## Zero-divergence policy

The mirror must not carry behavioral source patches. PSMFD changes are limited
to approved overlay paths. If an upstream sync requires modifying
upstream-owned source/build files, the sync must stop and be escalated before
merge.

Approved overlay paths are listed in `.psmfd/overlay-allowlist.txt`.

## Upstream automation provenance

This repository preserves upstream workflow history for provenance and reference
only. Retention does not approve execution.

Upstream workflows are reference-only unless PSMFD explicitly classifies them as
adapted or adopted. Any workflow that runs in this repository must be reviewed
against the PSMFD security baseline and recorded in the approved workflow list.

## Release artifacts

PSMFD release tags use the form `vX.Y.Z-psmfd.N`. These tags identify
PSMFD-built artifacts for a selected upstream base version. Upstream tags are
imported as source references and are not PSMFD release attestations.
