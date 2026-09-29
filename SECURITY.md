# Security policy

## Supported scope

This mirror exists to build, scan, attest, and publish PSMFD-owned pi runtime
releases from selected upstream source versions.

Security reports for upstream pi behavior should generally be reported to the
upstream project unless the issue is specific to PSMFD source patches, automation,
release artifacts, provenance, or attestations.

## Reporting vulnerabilities

Report PSMFD mirror-specific security concerns through GitHub private
vulnerability reporting for this repository. If private vulnerability reporting
is temporarily unavailable, do not open a public disclosure; contact the PSMFD
maintainer through an established private channel and request that private
vulnerability reporting be enabled.

Do not open public issues containing secrets, exploit details, or private
vulnerability information.

## Repository secret policy

This repository should not store long-lived package registry or cloud provider
secrets. Release workflows should prefer GitHub OIDC/keyless mechanisms and
least-privilege `GITHUB_TOKEN` permissions.

## Mirror integrity policy

- PSMFD records upstream source references without claiming upstream signature
  validation or endorsement. A squash can preserve imported content without
  preserving its ancestry; see [the import record](PROVENANCE.md#import-topology).
- PSMFD release tags use `vX.Y.Z-psmfd.N`.
- Overlay changes must remain within approved overlay paths.
- Source divergence requires a manifest-tracked security (S-class) or admitted
  capability (C-class) patch, maintainer review, evidence, and aligned allowlists
  in both guards. Unregistered source changes require escalation.
- S-class is scope-bound; C-class has per-sync caps and admission conditions.
  See [the patch policy](PROVENANCE.md#bounded-source-divergence) and
  [security baseline](.psmfd/security-baseline.md). Patch-path exemptions and
  trusted-sync bypasses do not prove patch correctness or upstream endorsement.
