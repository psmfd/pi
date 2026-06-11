# Security policy

## Supported scope

This mirror exists to build, scan, attest, and publish PSMFD-owned pi runtime releases from selected upstream source versions.

Security reports for upstream pi behavior should generally be reported to the upstream project unless the issue is specific to PSMFD mirror automation, release artifacts, provenance, or attestations.

## Reporting vulnerabilities

Report PSMFD mirror-specific security concerns through GitHub private vulnerability reporting if enabled for this repository, or through the maintainer's established private security contact.

Do not open public issues containing secrets, exploit details, or private vulnerability information.

## Repository secret policy

This repository should not store long-lived package registry or cloud provider secrets. Release workflows should prefer GitHub OIDC/keyless mechanisms and least-privilege `GITHUB_TOKEN` permissions.

## Mirror integrity policy

- Upstream source commits are preserved; PSMFD does not re-sign or rewrite upstream history.
- PSMFD release tags use `vX.Y.Z-psmfd.N`.
- Overlay changes must remain within approved overlay paths.
- Any requested source patch must be rejected for this mirror and handled upstream or in a separate repository.
