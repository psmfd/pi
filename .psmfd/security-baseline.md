# PSMFD mirror security baseline

This document records the security baseline for the `psmfd/pi` mirror. The
mirror preserves upstream files for review and provenance while limiting PSMFD
changes to documented overlay paths.

## Workflow execution surface

GitHub Actions workflows are executable automation for this repository. Treat
workflow YAML as an execution surface, not as passive documentation.

Upstream workflows are retained for provenance and reference only. They are not
an approved execution surface for this repository. Only workflows developed by
PSMFD, adapted by PSMFD, or explicitly adopted by PSMFD after review may be
enabled or run.

Workflow classifications:

| Classification | May run? | Meaning |
| --- | ---: | --- |
| PSMFD-developed | Yes | Created by PSMFD for this mirror. |
| PSMFD-adapted | Yes, after review | Derived from another source and changed for this mirror. |
| PSMFD-adopted | Yes, after review | Accepted without material changes after review. |
| Upstream-reference | No | Preserved only for provenance or migration context. |

Before public release, every active workflow file must be classified and every
runnable workflow must appear in `.psmfd/workflow-allowlist.yml`.

## Current baseline

- Repository visibility: private during readiness; public only after the
  public-flip checklist is complete.
- GitHub Actions: enabled with selected-actions restrictions.
- Default `GITHUB_TOKEN` permissions: read-only.
- Root README policy: `README.md` is an approved PSMFD public landing-page
  overlay for this detached mirror.
- Active workflow directory policy: `.github/workflows/` is reserved for PSMFD
  workflows whose filenames start with `psmfd-`.
- Active workflow set: `.github/workflows/psmfd-zero-divergence.yml`,
  `.github/workflows/psmfd-release.yml` (build-and-attest releases per
  ADR-0038; `workflow_dispatch` only so the workflow body always loads from
  the protected default branch; recorded in the workflow allowlist), and
  `.github/workflows/psmfd-divergence-detect.yml` (detective post-push
  divergence check, see "Branch protection" below).
- Upstream workflow reference directory:
  `.github/workflows-upstream-reference/`.
- Branch protection must require the `enforce overlay path allowlist` status
  check before public release (now carried by the `protect-main` ruleset; see
  "Branch protection" below).

## Branch protection

`main` is governed by the **`protect-main` repository ruleset** (migrated from
classic branch protection): require a pull request, the required status check
`enforce overlay path allowlist`, block force pushes, and block deletion. The
inherited enterprise ruleset layers additional review requirements on top
(GitHub enforces the union). The separate `protect-psmfd-release-tags` tag
ruleset is unaffected.

The ruleset grants the **repository Admin role a bypass actor**
(`bypass_mode: always`) so the solo maintainer can force-push to `main` as an
operational escape hatch, while non-admin collaborators remain fully bound by
the regular process (PR + required check + no force-push). This deliberately
trades the all-or-nothing classic `enforce_admins` toggle for a role-scoped
bypass. Accepted residual: a ruleset bypass actor bypasses the *entire* ruleset,
so an admin force-push (or direct push) can land non-overlay source on `main`
without the preventive PR guard running.

Because that gap is inherent to allowing force-push at all, it is covered by a
**detective control**: `.github/workflows/psmfd-divergence-detect.yml` runs on
every push to `main` and fails loudly + opens a `divergence-alert` issue if the
push introduced non-overlay changes that did not arrive via a trusted
`sync/upstream-*` PR, or if it was a force-push. It cannot block the push (the
bypass already happened) but makes the event auditable and red-flags the next
release. Its overlay matcher is duplicated from `psmfd-zero-divergence.yml` and
must be kept in lockstep. When collaborators are added, switch the bypass to a
named-user actor (or never grant a collaborator the Admin role) to avoid the
bypass leaking by role.

## Dependabot scope

Dependabot is limited to the `github-actions` ecosystem for this mirror until a
separate dependency policy is approved. Do not enable package-manager update
PRs for upstream-owned lockfiles without an explicit upstream-sync decision.

## Secret-scanning baseline

Gitleaks is the canonical secret scanner for the public-flip and upstream-sync
gates. This mirror carries a root `.gitleaks.toml` because it preserves upstream
history and must distinguish accepted upstream-public scanner noise from
PSMFD-owned secrets.

The gate runs two ways, both using this mirror's own `.gitleaks.toml`:

- **CI (continuous):** the `psmfd-secrets-scan` workflow scans the push/PR commit
  range on every change to `main`, using a digest-pinned public gitleaks
  container (`ghcr.io/gitleaks/gitleaks`). The mirror is public and pi_config is
  private, so a pinned public image is used rather than a pi_config-hosted
  reusable workflow (a public repo cannot call a private repo's reusable
  workflow). See pi_config ADR-0048.
- **Local/manual:** `scan-secrets --range OLD..NEW` (pi_config ADR-0048, installed
  to `~/.local/bin`); `.psmfd/sync-upstream.sh validate` invokes it over
  `main..HEAD` when the merge is committed. Because the allowlists are
  commit-scoped, the scan must run in gitleaks' `git` (history/range) mode — a
  working-tree scan would not apply them.

Keep the pinned gitleaks version in the workflow in step with pi_config's
vendored binary pin (ADR-0037).

The current allowlist is scoped by commit and path only. It covers:

- an upstream Anthropic OAuth beta protocol header that is not a credential;
- upstream Google OAuth native-app client credentials accepted as
  upstream-public runtime identifiers, not PSMFD-owned secrets;
- upstream Claude model identifier mappings that are not credentials.

Do not add broad regex-only or rule-wide allowlists. New findings must be
triaged before public release or upstream sync.

## Pre-public checklist

Before making `psmfd/pi` public:

- [ ] Inventory every `.github/workflows/*.yml` and
  `.github/workflows/*.yaml` file.
- [ ] Confirm every active workflow is PSMFD-developed, PSMFD-adapted, or
  explicitly PSMFD-adopted.
- [ ] Confirm upstream-reference workflows are unable to run in this repository.
- [ ] Confirm every runnable workflow appears in
  `.psmfd/workflow-allowlist.yml`.
- [ ] Confirm no reference-only workflow is required by branch protection,
  release automation, or repository rules.
- [ ] Confirm runnable workflows use least-privilege permissions and do not
  require long-lived repository secrets.
- [ ] Confirm public README/provenance docs link to this security baseline.
- [ ] Confirm branch protection requires the intended PSMFD checks only,
  including `enforce overlay path allowlist`.
- [ ] Confirm repository Actions settings allow only the intended execution
  surface.
- [ ] Confirm fork pull request workflow settings require appropriate approval
  for first-time contributors.
- [ ] Enable GitHub private vulnerability reporting or publish an equivalent
  private security-reporting contact before accepting public reports.

## Bootstrap validation

This section records that the zero-divergence guard was validated with an
allowed-path bootstrap PR while the repository remained private.

## Trusted upstream-sync bypass

The zero-divergence guard skips path enforcement only for same-repository PRs
from `sync/upstream-*` branches authored by the configured trusted sync actor.
That bypass is limited to upstream synchronization and must not be used to carry
behavioral source patches in the mirror.

## Security-patch divergence

Distinct from the sync bypass above, the mirror may carry a temporary,
manifest-tracked patch to upstream-owned source for a security finding that has
no upstream fix or fix in flight (ADR-0041, `pi_config`). This is the only
sanctioned reason to modify upstream-owned files outside a sync.

- Eligibility: a CodeQL/code-scanning alert or a CVE/advisory (not a routine
  version refresh), with no merged upstream commit and no open upstream PR
  likely to merge — verified and recorded at patch time.
- Mechanism: the patched paths are listed in
  [`.psmfd/patches/manifest.yml`](patches/manifest.yml) and added in lockstep to
  `.psmfd/overlay-allowlist.txt` and the `SECURITY_PATCH_PATHS` set in
  `.github/workflows/psmfd-zero-divergence.yml`. The guard's trust model is
  unchanged — only its allowlist data widens — so every security-patch PR still
  requires maintainer review before merge. Because a same-repository PR can edit
  the guard workflow it runs under, maintainer review (not the guard alone) is
  the binding control that a path added to `SECURITY_PATCH_PATHS` corresponds to
  a genuine manifest-registered finding.
- Dependency bumps: a lockfile/manifest bump that resolves a CVE is treated as
  the same class as a source patch (the attested bytes depend on it) and follows
  the same manifest + allowlist discipline. This is the sanctioned narrowing of
  the "Dependabot scope" limitation above for security-relevant bumps; routine
  refreshes still wait for an upstream sync. The `min-release-age` supply-chain
  control in `.npmrc` is not overridden to apply a bump — a patched version too
  new to install waits for the age window.
- Retirement: when upstream ships its own fix, the patch is dropped on the
  `sync/upstream-*` import that carries it, the manifest entry is marked
  `retired`, and the path is removed from the allowlist and guard.

## Upstream reporting gate

Fixing a security finding in the mirror and reporting it upstream are separate
decisions (ADR-0043). The mirror **always fixes** (above); whether the fix is
**reported upstream** is decided afterward, gated on upstream's own published
policy:

- **`SECURITY.md` scope** (upstream `earendil-works/pi`) decides whether the
  finding is an in-scope vulnerability. Upstream treats the local user and
  user-writable files as inside Pi's trust boundary and puts out of scope:
  installing untrusted packages/extensions, user-initiated local actions, local
  code execution / sandboxing, and dependency reports unless the dependency is
  "reachable through Pi". Read it live at determination time — it changes.
- **`CONTRIBUTING.md` process** governs how anything is submitted: new
  contributors are auto-closed, approval is a maintainer `lgtm`, no PR before
  approval, issues must be human-authored, and agent-driven/high-volume
  submissions are permanently blocked.

Consequences for this mirror:

- Report upstream only when the finding is in scope under `SECURITY.md`. In-scope
  security issues use the private channel (`security@earendil.com` / GitHub
  private advisory); a non-security hardening worth offering uses the
  contribution path, not the security channel.
- **Reporting is human-led** — the agent never files upstream issues, PRs, or
  advisories (it may prepare materials only). This respects both the upstream
  anti-automation policy and the maintainer's standing approval gate.
- Record the determination per patch in `.psmfd/patches/manifest.yml`
  (`reporting:` field). "Not reported" is a logged decision, not an omission.
- The current patches (`psmfd-patch-001`..`004`) were all assessed **out of
  upstream scope → not reported**; see their manifest entries.
