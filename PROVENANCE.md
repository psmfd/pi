# PSMFD mirror provenance

This repository is a detached PSMFD mirror of the upstream pi source repository:

- Upstream: <https://github.com/earendil-works/pi>
- Mirror owner: PSMFD
- Mirror repository: <https://github.com/psmfd/pi>
- Seed commit: `406a2214aa1dce746a1902605daf04e6727349dc`
- Seed source branch: upstream `main`

## Trust statement

PSMFD builds selected upstream source versions with approved overlays and bounded
source patches. PSMFD does not claim authorship of upstream commits, retroactively
vouch for their signatures, or claim upstream endorsement of PSMFD changes.
Recorded upstream source content and Git ancestry are separate provenance facts;
the v0.87.1 import below demonstrates that distinction.

The root `README.md` is replaced with the PSMFD public landing page. Upstream
project documentation remains available from the upstream repository.

## Bounded source divergence

The two-class policy in pi_config ADR-0138 supersedes the security-only policy
in ADR-0041. Outside approved overlays and registered patches, upstream-owned
source/build changes require explicit review and escalation before merge.
See the [security baseline](.psmfd/security-baseline.md) for admission and reporting
conditions and the [patch manifest](.psmfd/patches/manifest.yml) for individual
scope, origin, evidence, and retirement records.

- **Security (S-class):** a security finding with no upstream fix or fix in
  flight, verified at patch time. Routine version refreshes do not qualify.
  S-class is cap-exempt but contains only changes required by the finding and
  its regression tests. It retires when an upstream fix is imported.
- **Capability (C-class):** an admitted runtime seam or primitive with evidence
  that an extension is insufficient, subject to generation admission and soak
  conditions. ADR-0145 admits patches 010–012. Patch 013 is the narrow PR #74
  maintainer admission for cache-warmer correctness without a generation ADR or
  consumer soak; it does not widen general eligibility. C-class retires when
  upstream adopts equivalent behavior or the patch is dropped.

At the **2026-09-29 checkpoint** on `main`
`d58da7c83c57e8e51d5e8e21ec24da4ee7131aba`, 11 patches are active:

| Class | Patch IDs (prefix `psmfd-patch-`) | Scope |
| --- | --- | --- |
| S | 001, 003, 005 | Git argument/transport hardening; sandbox shell-quote pin |
| S | 014–017 | Overflow/LaTeX/skill-path performance; owned tool-slot validation |
| C | 010–012 | RPC hello, session listing, startup dialogs |
| C | 013 | Stop cache warming after failed refreshes |

Every active path must match the manifest, `.psmfd/overlay-allowlist.txt`, and
the appropriate `SECURITY_PATCH_PATHS` or `C_CLASS_PATCH_PATHS` set in **both**
`psmfd-zero-divergence.yml` and `psmfd-divergence-detect.yml`. Patch commits use
`PSMFD-Patch: <id>` trailers; the manifest records mainline integration separately
from supporting PR history when squashing loses those individual commits.
Retirement updates the manifest and drops exemptions between sync merge and
resolution, never by rebasing history. Shared paths retain exemptions while any
active patch owns them. C-class conflicts resolved with `--ours` must record
discarded upstream changes as drift debt.

Maintainer review is the binding control: same-repository PRs can edit guards,
and trusted same-repository `sync/upstream-*` PRs from the configured actor bypass
path enforcement. Neither path exemptions nor that bypass approve arbitrary
source changes. Security reporting remains a separate, human-led decision under
the baseline's reporting gate; manifest determinations are historical records.

### Capability caps at this checkpoint

All active patches now use upstream `v0.87.1` as the verified content baseline.
ADR-0138 counts insertions **plus** deletions from that tree to the checkpoint,
restricted to each patch's paths, then sums across active C-class patches:

| Patch | Insertions + deletions |
| --- | ---: |
| 010 | 392 |
| 011 | 439 |
| 012 | 277 |
| 013 | 80 |
| **Per-patch sum** | **1,188 / 2,000** |

The other caps are **4 / 6 active C-class patches** and **8 / 25 distinct files**.
Counting the union of C-class paths once gives **734 changed lines**. That is a
useful residual size, but the policy cap uses **1,188**: shared RPC paths count
under each owning patch. Recompute at every sync; a breach stops the sync.

## Import topology

Verified on 2026-09-29 for [PR #74](https://github.com/psmfd/pi/pull/74):

| Role | Commit |
| --- | --- |
| Upstream v0.87.1 content baseline | `f07218c4d4bbc12bef056a7058c3dd49dfe41abe` |
| Original import merge in PR history | `4c632dfc3a52468cb91e55235849f79bb4024051` |
| Final tested PR head | `95660570efdc015d90ce218a5284a9659ce17f8a` |
| Squash integration on main | `2e5b4b1d19695d2f3a36c1b37db252e8950a171b` |
| Integration's sole parent | `e7d09c9dc5fca409f46a5476669e3c0404054d69` |

The tested PR head and main integration have identical tree
`4d1a6028555f1616bd76ac048058304119c8a220`. The original import merge has the
upstream commit as a parent; the squash does not. Neither upstream v0.87.1,
the original import merge, nor the final tested PR head is an ancestor of the
checkpoint on `main`. Its merge base with upstream v0.87.1 is still v0.85.1,
`d981de1229ef899957bbe968bc8dcda02a21f477`.

This records a deviation from the prescribed upstream-sync merge-commit
procedure, not a new squash policy. PR #75 subsequently added the durable
workspace release-build follow-up in approved overlay paths.

**Next sync:** `.psmfd/sync-upstream.sh` uses reachability for its preview and
`git merge-base` for its evidence range; those can include already imported
content after this squash. Compare explicitly against the recorded v0.87.1
content baseline as well as inspecting actual merge ancestry and conflicts.
Refreshing manifest `upstream_base` values does not repair the graph. History
repair and sync-tool changes require separately scoped work.

## Evidence limits

The checkpoint comparison attributes residual upstream source differences to
the 11 active patches and verifies overlay/workflow quarantine boundaries.
The manifest preserves earlier test, audit, and consumer evidence as historical;
the 2026-09-29 reconciliation is a static source/metadata check, not a new runtime
qualification, upstream-adoption determination, or release attestation.

Existing PR #75 validation gaps remain: local Node 24 versus release Node 22,
an unchanged auth-storage coalesced-reload test failure, and dependency-audit
findings (Vitest-family follow-up #72 and the gondolin example's transitive
undici). No paid-provider or new consumer soak is claimed. Those gaps are not
cleared by documentation or manifest reconciliation.

## Upstream automation provenance

Upstream workflow reference copies are quarantined under
`.github/workflows-upstream-reference/`; retention does not approve execution.
Any runnable workflow must be explicitly classified, reviewed against the
[security baseline](.psmfd/security-baseline.md), and recorded in the
[workflow allowlist](.psmfd/workflow-allowlist.yml).

## Release artifacts

PSMFD release tags use `vX.Y.Z-psmfd.N` for PSMFD-built artifacts from a selected
upstream base. Upstream source references are not PSMFD release attestations.
Importing v0.87.1 source and reconciling these records does not publish a release.
