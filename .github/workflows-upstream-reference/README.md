# Upstream workflow reference

This directory contains workflow files preserved from upstream pi history for
provenance and reference only.

Files in this directory are not an approved execution surface for this
repository. GitHub Actions only auto-discovers workflow files under
`.github/workflows/` with a `.yml` or `.yaml` extension, so these reference
copies are intentionally inert.

To use any workflow here, PSMFD must explicitly adapt or adopt it through a PR
that:

1. reviews triggers, permissions, secrets, third-party actions, and release
   behavior;
2. moves the approved workflow into `.github/workflows/` with a `psmfd-` prefix;
3. records the workflow in `.psmfd/workflow-allowlist.yml`; and
4. receives the required CODEOWNERS review.
