#!/usr/bin/env bash
#
# sync-upstream.sh — automate the psmfd/pi mirror upstream-sync runbook.
#
# Automates the mechanical, deterministic steps of the sync procedure defined by
# ADR-0039 (pi_config) and docs/psmfd-pi-mirror-sync.md: preflight checks, the
# namespace-isolated upstream fetch, the --no-ff merge of an upstream release
# tag, the mechanical overlay-allowlist conflict resolution, upstream-workflow
# quarantine, the validation gate, and generation of the per-sync evidence
# block. It does NOT make the divergence-sensitive judgments — patch retirement,
# allowlist edits, conflict-resolution overrides, and PR review stay human-gated
# (see `reconcile`). The script reports; the maintainer decides.
#
# This script lives on an overlay path (.psmfd/**) and is itself overlay tooling:
# it must never be committed onto a sync/upstream-* branch (those carry upstream
# history + mechanical resolutions + manifest-tracked patch retirements only).
#
# Usage:
#   .psmfd/sync-upstream.sh <command> [args]
#
# Commands:
#   preflight            Verify repo root, clean tree, upstream remote config,
#                        and report refs/tags upstream-tag pollution.
#   setup                Configure the namespace-isolated upstream remote
#                        (idempotent; safe to re-run).
#   fetch                Fetch upstream main + tags into refs/upstream/* (no
#                        refs/tags pollution).
#   latest               Print the latest upstream release tag (vX.Y.Z).
#   preview <tag>        Show the commit range main..<upstream tag>.
#   merge <tag> [--sec]  Create sync/upstream-<tag>[-sec] from fresh main and
#                        --no-ff merge the upstream tag (leaves conflicts for
#                        resolve).
#   resolve              Mechanically resolve conflicts (--ours for current
#                        overlay-allowlist paths, --theirs otherwise) and
#                        quarantine any upstream workflow files. Run AFTER any
#                        patch-retirement allowlist edits.
#   reconcile <tag>      Report, per manifest patch, whether upstream <tag>
#                        changed the patched paths (retirement signal). Decision
#                        stays human-gated.
#   validate             npm install --ignore-scripts, npm run check, ./test.sh,
#                        npm audit (reports; non-zero on check/test failure).
#   evidence <tag>       Emit the per-sync PR evidence block to stdout.
#   prune-pollution      Delete local plain upstream vX.Y.Z tags from refs/tags
#                        (keeps refs/upstream/tags + PSMFD vX.Y.Z-psmfd.N tags).
#                        Prompts unless FORCE=1.
#
# Exit codes:
#   0  success / all checks passed
#   1  a check or step failed (errors found)
#   2  environment or precondition failure (wrong dir, missing dep, bad args)
#
# Environment:
#   PI_ALLOW_LOCKFILE_CHANGE=1  permit `validate` to accept a lockfile change
#   FORCE=1                     skip the prune-pollution confirmation prompt
#   VERBOSE=1                   print indented detail output
#
set -euo pipefail

# --- Output helpers (script-output-conventions). Inline because this is a
# --- standalone overlay script with no access to pi_config scripts/lib/log.sh.
LOG_ERROR_COUNT=0
LOG_WARN_COUNT=0
ok()    { printf 'OK    [%s] %s\n' "$1" "$2"; }
skip()  { printf 'SKIP  [%s] %s\n' "$1" "$2"; }
warn()  { printf 'WARN  [%s] %s\n' "$1" "$2" >&2; ((LOG_WARN_COUNT++))  || true; }
info()  { printf 'INFO  %s\n' "$*"; }
err()   { printf 'ERROR [%s] %s\n' "$1" "$2" >&2; ((LOG_ERROR_COUNT++)) || true; }
detail(){ [ "${VERBOSE:-0}" = "1" ] && printf '      %s\n' "$*" || true; }
fatal() { err "$1" "$2"; exit "${3:-1}"; }
print_summary() {
  printf '==================================\n'
  if [ "$LOG_ERROR_COUNT" -eq 0 ]; then
    printf 'PASS — %d errors, %d warnings\n' "$LOG_ERROR_COUNT" "$LOG_WARN_COUNT"
  else
    printf 'FAIL — %d errors, %d warnings\n' "$LOG_ERROR_COUNT" "$LOG_WARN_COUNT"
  fi
}

UPSTREAM_URL="https://github.com/earendil-works/pi.git"
ALLOWLIST=".psmfd/overlay-allowlist.txt"
MANIFEST=".psmfd/patches/manifest.yml"

# --- Preconditions -----------------------------------------------------------

require_repo_root() {
  # The mirror root is identified by its overlay contract files.
  if [ ! -f "$ALLOWLIST" ] || [ ! -f "PROVENANCE.md" ]; then
    fatal "repo-root" "run from the psmfd/pi mirror root (missing $ALLOWLIST / PROVENANCE.md)" 2
  fi
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    fatal "repo-root" "not inside a git working tree" 2
  fi
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || fatal "deps" "required command not found: $1" 2; }

require_clean_tree() {
  if [ -n "$(git status --porcelain)" ]; then
    fatal "clean-tree" "working tree is dirty; commit or stash before syncing" 2
  fi
}

# --- Overlay path matcher (mirrors psmfd-zero-divergence.yml allowed()) -------
# A path is overlay-owned (and so wins with --ours on conflict) when it matches
# the guard's EXACT set, one of the structural regexes, OR appears as a live
# exact path in the overlay allowlist (the security-patch exemptions). Reading
# the live allowlist is deliberate: retiring a patch removes its path here, which
# flips its conflict resolution to --theirs (take upstream) automatically.
is_overlay_path() {
  local path="$1"
  case "$path" in
    PROVENANCE.md|README.md|README.psmfd.md|SECURITY.md|NOTICE.psmfd.md|\
    .gitleaks.toml|.github/CODEOWNERS|.github/dependabot.yml) return 0 ;;
  esac
  # Structural regexes (POSIX ERE), matching the guard exactly.
  if printf '%s' "$path" | grep -Eq '^\.psmfd/.+$'; then return 0; fi
  if printf '%s' "$path" | grep -Eq '^\.github/workflows/psmfd-[^/]+\.ya?ml$'; then return 0; fi
  if printf '%s' "$path" | grep -Eq '^\.github/workflows-upstream-reference/[^/]+\.ya?ml$'; then return 0; fi
  if printf '%s' "$path" | grep -Eq '^\.github/workflows-upstream-reference/README\.md$'; then return 0; fi
  # Live security-patch exemptions: exact, non-comment, non-glob allowlist lines.
  local line
  while IFS= read -r line; do
    line="${line%%#*}"
    line="$(printf '%s' "$line" | tr -d '[:space:]')"
    [ -z "$line" ] && continue
    case "$line" in *'*'*) continue ;; esac   # skip glob patterns
    [ "$line" = "$path" ] && return 0
  done < "$ALLOWLIST"
  return 1
}

# --- Tag helpers -------------------------------------------------------------

latest_upstream_tag() {
  # Highest vX.Y.Z release tag under refs/upstream/tags (excludes pre-release).
  git for-each-ref --sort='-version:refname' --format='%(refname:lstrip=3)' \
    'refs/upstream/tags/v*' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | head -n1
}

require_upstream_tag() {
  local tag="$1"
  git rev-parse --verify -q "refs/upstream/tags/${tag}^{commit}" >/dev/null \
    || fatal "tag" "upstream tag not found: refs/upstream/tags/${tag} (run: $0 fetch)" 2
}

# --- Commands ----------------------------------------------------------------

cmd_setup() {
  require_repo_root
  git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
  git remote set-url --push upstream DISABLE
  # Reset both namespace-isolated refspecs idempotently. A plain `git config set`
  # of a multi-valued key aborts (exit 5), so clear then re-add. --unset-all
  # tolerates the key being absent on a first run.
  git config --unset-all remote.upstream.fetch 2>/dev/null || true
  git config --add remote.upstream.fetch '+refs/heads/main:refs/upstream/main'
  git config --add remote.upstream.fetch '+refs/tags/*:refs/upstream/tags/*'
  git config remote.upstream.tagOpt --no-tags
  ok "setup" "upstream remote configured (namespace-isolated, fetch-only)"
  print_summary
}

cmd_preflight() {
  require_repo_root
  require_cmd git
  ok "repo-root" "in psmfd/pi mirror root"

  if [ -n "$(git status --porcelain)" ]; then
    warn "clean-tree" "working tree is dirty (commit/stash before merge)"
  else
    ok "clean-tree" "working tree clean"
  fi

  # Upstream remote config matches the runbook.
  local fetch tagopt pushurl
  fetch="$(git config --get-all remote.upstream.fetch 2>/dev/null || true)"
  tagopt="$(git config --get remote.upstream.tagOpt 2>/dev/null || true)"
  pushurl="$(git config --get remote.upstream.pushurl 2>/dev/null || true)"
  if printf '%s\n' "$fetch" | grep -qx '+refs/heads/main:refs/upstream/main' \
     && printf '%s\n' "$fetch" | grep -qx '+refs/tags/\*:refs/upstream/tags/\*'; then
    ok "remote-refspec" "namespace-isolated refspecs present"
  else
    warn "remote-refspec" "upstream refspecs not namespace-isolated (run: $0 setup)"
  fi
  if [ "$tagopt" = "--no-tags" ]; then
    ok "remote-tagopt" "tagOpt=--no-tags"
  else
    warn "remote-tagopt" "remote.upstream.tagOpt is not --no-tags (run: $0 setup)"
  fi
  if [ "$pushurl" = "DISABLE" ]; then
    ok "remote-push" "push disabled (fetch-only upstream)"
  else
    warn "remote-push" "upstream push url is not DISABLE (run: $0 setup)"
  fi

  # refs/tags pollution: plain upstream vX.Y.Z tags that should live only under
  # refs/upstream/tags. PSMFD release tags (vX.Y.Z-psmfd.N) are legitimate.
  local polluted
  polluted="$(git for-each-ref --format='%(refname:lstrip=2)' 'refs/tags/v*' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)"
  if [ -n "$polluted" ]; then
    warn "tag-pollution" "$(printf '%s\n' "$polluted" | wc -l | tr -d ' ') plain upstream tag(s) in refs/tags (run: $0 prune-pollution)"
    detail "$(printf '%s' "$polluted" | tr '\n' ' ')"
  else
    ok "tag-pollution" "no plain upstream tags in refs/tags"
  fi

  print_summary
  [ "$LOG_ERROR_COUNT" -eq 0 ] || return 1
}

cmd_fetch() {
  require_repo_root
  # Respects the configured refspec + --no-tags; never use --tags (it pollutes
  # refs/tags with upstream tags).
  git fetch upstream
  ok "fetch" "upstream fetched into refs/upstream/*"
  print_summary
}

cmd_latest() {
  require_repo_root
  local tag; tag="$(latest_upstream_tag)"
  [ -n "$tag" ] || fatal "latest" "no upstream release tag found (run: $0 fetch)" 1
  printf '%s\n' "$tag"
}

cmd_preview() {
  require_repo_root
  local tag="${1:?usage: $0 preview <tag>}"
  require_upstream_tag "$tag"
  info "Commit range main..${tag}:"
  git log "refs/upstream/tags/${tag}" --oneline --not main
}

cmd_merge() {
  require_repo_root
  require_clean_tree
  local tag="${1:?usage: $0 merge <tag> [--sec]}"
  local suffix=""
  [ "${2:-}" = "--sec" ] && suffix="-sec"
  require_upstream_tag "$tag"

  local branch="sync/upstream-${tag}${suffix}"
  if git rev-parse --verify -q "refs/heads/${branch}" >/dev/null; then
    fatal "merge" "branch ${branch} already exists; delete it or resume manually" 2
  fi

  git switch main          || fatal "merge" "could not switch to main" 2
  git pull --ff-only       || fatal "merge" "git pull --ff-only on main failed (diverged or no tracking branch)" 2
  git switch -c "$branch"  || fatal "merge" "could not create ${branch}" 2
  info "Created ${branch}; merging refs/upstream/tags/${tag} (--no-ff)…"
  if git merge "refs/upstream/tags/${tag}" --no-ff \
       -m "sync: incorporate upstream ${tag}"; then
    ok "merge" "merged cleanly with no conflicts"
    # A clean merge can still introduce upstream workflow files; quarantine runs
    # unconditionally (the conflict path defers it to `resolve`).
    quarantine_workflows
    info "Run '$0 reconcile ${tag}' for the patch signal, then '$0 validate'."
  else
    local n; n="$(git diff --name-only --diff-filter=U | wc -l | tr -d ' ')"
    warn "merge" "${n} conflicted path(s); review '$0 reconcile ${tag}', edit the allowlist for any patch retirements, then run: $0 resolve"
  fi
  print_summary
  [ "$LOG_ERROR_COUNT" -eq 0 ] || return 1
}

# Move any non-psmfd-* workflow under .github/workflows/ to the reference dir so
# it can never execute. Recurses subdirectories (git ls-files of the dir prefix)
# and uses `--` so a filename beginning with `-` cannot be read as a git option.
# Idempotent: a file already present at the destination is left for manual review.
quarantine_workflows() {
  local wf base dest moved=0
  while IFS= read -r wf; do
    [ -z "$wf" ] && continue
    base="$(basename "$wf")"
    case "$base" in psmfd-*) continue ;; esac
    dest=".github/workflows-upstream-reference/${base}"
    if [ -e "$dest" ]; then
      skip "quarantine" "destination exists, left for manual review: $wf"
      continue
    fi
    git mv -- "$wf" "$dest"
    warn "quarantine" "moved $wf -> workflows-upstream-reference/ (review against security-baseline.md)"
    moved=$((moved+1))
  done < <(git ls-files -- '.github/workflows/' | grep -Ei '\.ya?ml$' || true)
  [ "$moved" -eq 0 ] && ok "quarantine" "no non-psmfd workflows to quarantine in .github/workflows/" || true
}

cmd_resolve() {
  require_repo_root
  local conflicts; conflicts="$(git diff --name-only --diff-filter=U || true)"
  if [ -z "$conflicts" ]; then
    skip "resolve" "no conflicted paths"
  else
    local path
    while IFS= read -r path; do
      [ -z "$path" ] && continue
      if is_overlay_path "$path"; then
        git checkout --ours -- "$path"
        git add -- "$path"
        ok "resolve-ours" "$path"
      else
        git checkout --theirs -- "$path"
        git add -- "$path"
        ok "resolve-theirs" "$path"
      fi
    done <<< "$conflicts"
  fi

  quarantine_workflows

  local remaining; remaining="$(git diff --name-only --diff-filter=U || true)"
  if [ -z "$remaining" ]; then
    ok "resolve" "all conflicts resolved (review, then commit the merge)"
  else
    err "resolve" "unresolved conflicts remain: $(printf '%s' "$remaining" | tr '\n' ' ')"
  fi
  print_summary
  [ "$LOG_ERROR_COUNT" -eq 0 ] || return 1
}

cmd_reconcile() {
  require_repo_root
  local tag="${1:?usage: $0 reconcile <tag>}"
  require_upstream_tag "$tag"
  [ -f "$MANIFEST" ] || fatal "reconcile" "missing $MANIFEST" 2

  info "Patch reconciliation vs upstream ${tag} (signal only — retire/keep is human-gated):"
  info ""
  # Walk the manifest: each `- id:` begins a patch; capture status, upstream_base,
  # and the patched_paths list. The retirement SIGNAL is whether upstream itself
  # changed each patched path between the patch's upstream_base and the target
  # tag — both UPSTREAM refs, never our patched HEAD (our tree always differs
  # because it carries the patch). Upstream touched the path => it may now ship
  # its own fix => RETIRE? candidate. Upstream left it untouched => the patch is
  # still solely ours => KEEP. The agent/security verification decides; this only
  # narrows where to look.
  # NOTE: this manifest walk is order-sensitive — it relies on `status:` and
  # `upstream_base:` appearing before `patched_paths:` within each patch block,
  # and on `patched_paths` being the only list field. It matches the current
  # manifest schema; a new list field elsewhere would need parser changes.
  local id="" status="" base="" in_paths=0 paths="" shared_pairs=""
  emit_patch() {
    [ -z "$id" ] && return 0
    # Accumulate active-patch path ownership so shared paths can be flagged (a
    # path owned by >1 active patch must not be dropped from the allowlist when
    # only one of its owners retires — doing so silently disables the others).
    if [ "$status" = "active" ]; then
      local sp
      while IFS= read -r sp; do
        [ -z "$sp" ] && continue
        shared_pairs="${shared_pairs}${sp}	${id}"$'\n'
      done <<< "$paths"
    fi
    local baseref="refs/upstream/tags/${base}"
    if [ -z "$base" ] || ! git rev-parse --verify -q "${baseref}^{commit}" >/dev/null; then
      printf '?      [%s] status=%s — upstream_base "%s" not fetched; cannot compute signal (fetch it or verify manually)\n' \
        "$id" "$status" "$base"
      return 0
    fi
    local changed=0 total=0 p
    while IFS= read -r p; do
      [ -z "$p" ] && continue
      total=$((total+1))
      if git diff --quiet "$baseref" "refs/upstream/tags/${tag}" -- "$p"; then
        :   # unchanged upstream since base
      else
        changed=$((changed+1))
      fi
    done <<< "$paths"
    if [ "$changed" -gt 0 ]; then
      printf 'RETIRE?[%s] status=%s — upstream changed %d/%d patched path(s) since %s; candidate for retirement (verify coverage)\n' \
        "$id" "$status" "$changed" "$total" "$base"
    else
      printf 'KEEP   [%s] status=%s — upstream left all %d patched path(s) untouched since %s; still PSMFD-only\n' \
        "$id" "$status" "$total" "$base"
    fi
  }
  local line trimmed
  while IFS= read -r line; do
    trimmed="$(printf '%s' "$line" | sed 's/^[[:space:]]*//')"
    case "$trimmed" in
      "- id:"*)
        emit_patch
        id="$(printf '%s' "$trimmed" | sed 's/^- id:[[:space:]]*//')"
        status=""; base=""; paths=""; in_paths=0 ;;
      "status:"*)        [ -n "$id" ] && { status="$(printf '%s' "$trimmed" | sed 's/^status:[[:space:]]*//')"; in_paths=0; } ;;
      "upstream_base:"*) [ -n "$id" ] && { base="$(printf '%s' "$trimmed" | sed 's/^upstream_base:[[:space:]]*//')"; in_paths=0; } ;;
      "patched_paths:"*) in_paths=1 ;;
      "- "*)
        if [ "$in_paths" = "1" ]; then
          paths="${paths}$(printf '%s' "$trimmed" | sed 's/^-[[:space:]]*//')"$'\n'
        fi ;;
      *:*) [ "$in_paths" = "1" ] && in_paths=0 ;;
    esac
  done < "$MANIFEST"
  emit_patch

  # Flag paths owned by more than one ACTIVE patch: retiring one owner must not
  # remove the shared path from the allowlist/guard while another still needs it.
  local shared
  shared="$(printf '%s' "$shared_pairs" | awk -F'\t' '
    NF==2 { owners[$1] = owners[$1] " " $2; n[$1]++ }
    END   { for (p in n) if (n[p] > 1) printf "%s ->%s\n", p, owners[p] }')"
  if [ -n "$shared" ]; then
    info ""
    warn "shared-paths" "paths shared by multiple active patches — retire owners together or re-attribute before removing from the allowlist/guard:"
    printf '%s\n' "$shared" | sed 's/^/      /' >&2
  fi

  info ""
  info "Verify each RETIRE? candidate with security review (does upstream ${tag} actually"
  info "cover the advisory?) before dropping it from the manifest, overlay-allowlist.txt,"
  info "and SECURITY_PATCH_PATHS (lockstep). KEEP rows still need an upstream_base bump."
}

cmd_validate() {
  require_repo_root
  require_cmd npm
  local rc=0

  local lock_before; lock_before="$(git status --porcelain -- package-lock.json '**/npm-shrinkwrap.json' 2>/dev/null || true)"
  info "npm install --ignore-scripts…"
  if npm install --ignore-scripts >/dev/null 2>&1; then
    ok "install" "dependencies hydrated"
  else
    err "install" "npm install failed"; rc=1
  fi

  local lock_after; lock_after="$(git status --porcelain -- package-lock.json '**/npm-shrinkwrap.json' 2>/dev/null || true)"
  if [ "$lock_before" != "$lock_after" ]; then
    if [ "${PI_ALLOW_LOCKFILE_CHANGE:-0}" = "1" ]; then
      warn "lockfile" "lockfile changed (permitted: PI_ALLOW_LOCKFILE_CHANGE=1)"
    else
      err "lockfile" "lockfile changed during install; set PI_ALLOW_LOCKFILE_CHANGE=1 if intended"
      rc=1
    fi
  else
    ok "lockfile" "no unexpected lockfile change"
  fi

  info "npm run check…"
  if npm run check; then ok "check" "biome + ts + smoke clean"; else err "check" "npm run check failed"; rc=1; fi

  info "./test.sh…"
  if [ -x ./test.sh ]; then
    if ./test.sh; then ok "test" "non-e2e suite passed"; else err "test" "./test.sh failed"; rc=1; fi
  else
    skip "test" "./test.sh not present/executable"
  fi

  info "npm audit (report only)…"
  npm audit || warn "audit" "npm audit reported findings — triage each against the patch manifest (non-fatal: many are dev/build-only or already patch-tracked)"

  # The runbook's gitleaks gate is mandatory before merge but is not run here
  # (the scanner lives in pi_config, not the mirror). Surface it so it cannot be
  # silently skipped.
  warn "gitleaks" "MANDATORY before merge and NOT automated here: scan the new range with gitleaks and record version + exit status in the PR evidence block"

  print_summary
  return "$rc"
}

cmd_evidence() {
  require_repo_root
  local tag="${1:?usage: $0 evidence <tag>}"
  require_upstream_tag "$tag"
  local old_sha new_sha
  old_sha="$(git merge-base main "refs/upstream/tags/${tag}" 2>/dev/null || echo unknown)"
  new_sha="$(git rev-parse "refs/upstream/tags/${tag}")"
  cat <<EOF
## Sync evidence — upstream ${tag}

**1. Import range**
- Upstream remote: ${UPSTREAM_URL}
- Old upstream SHA (merge base): ${old_sha}
- New upstream SHA (${tag}): ${new_sha}

**2. Tag inventory** (upstream tags newly included in ${old_sha}..${tag})
$(git for-each-ref --sort='version:refname' --format='%(objectname) %(refname:lstrip=3)' 'refs/upstream/tags/v*' \
   | while read -r _sha _name; do
       if git merge-base --is-ancestor "$_sha" "refs/upstream/tags/${tag}" 2>/dev/null \
          && ! git merge-base --is-ancestor "$_sha" "${old_sha}" 2>/dev/null; then
         printf -- '- %s %s\n' "$_name" "$(git rev-parse --short "$_sha")"
       fi
     done)

**3. Surface summary (diffstat)**
\`\`\`
$(git diff --stat "${old_sha}..refs/upstream/tags/${tag}" | tail -n 40)
\`\`\`
Callouts — review these explicitly:
- .github/workflows/ changes: $(git diff --name-only "${old_sha}..refs/upstream/tags/${tag}" -- .github/workflows/ | tr '\n' ' ' || echo none)
- build/release scripts: $(git diff --name-only "${old_sha}..refs/upstream/tags/${tag}" -- scripts/ package.json | tr '\n' ' ' || echo none)
- lockfiles: $(git diff --name-only "${old_sha}..refs/upstream/tags/${tag}" -- package-lock.json '**/npm-shrinkwrap.json' | tr '\n' ' ' || echo none)

**4. Overlay conflict log** — fill from the resolve step output.
**5. Divergence proof** — confirm non-overlay diff main..sync equals the upstream diff for the range (registered security-patch paths excepted).
**6. Gitleaks result** — run the scanner over the new range; record version + exit status.
**7. Upstream signature observation** — per imported tag: signed/unsigned as *observed*, never verified.
EOF
}

cmd_prune_pollution() {
  require_repo_root
  local polluted
  polluted="$(git for-each-ref --format='%(refname:lstrip=2)' 'refs/tags/v*' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)"
  if [ -z "$polluted" ]; then
    ok "prune" "no plain upstream tags in refs/tags"
    print_summary; return 0
  fi
  info "Plain upstream tags in refs/tags (namespace-policy violations):"
  printf '%s\n' "$polluted" | sed 's/^/      /'
  if [ "${FORCE:-0}" != "1" ]; then
    printf 'Delete these local tags? They remain available under refs/upstream/tags. [y/N] '
    read -r reply
    case "$reply" in y|Y|yes|YES) ;; *) skip "prune" "aborted by user"; print_summary; return 0 ;; esac
  fi
  local t
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    if git tag -d "$t" >/dev/null 2>&1; then
      ok "prune" "deleted refs/tags/$t"
    else
      err "prune" "failed to delete refs/tags/$t"
    fi
  done < <(printf '%s\n' "$polluted")
  print_summary
  [ "$LOG_ERROR_COUNT" -eq 0 ] || return 1
}

usage() {
  sed -n '2,60p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    preflight)        cmd_preflight "$@" ;;
    setup)            cmd_setup "$@" ;;
    fetch)            cmd_fetch "$@" ;;
    latest)           cmd_latest "$@" ;;
    preview)          cmd_preview "$@" ;;
    merge)            cmd_merge "$@" ;;
    resolve)          cmd_resolve "$@" ;;
    reconcile)        cmd_reconcile "$@" ;;
    validate)         cmd_validate "$@" ;;
    evidence)         cmd_evidence "$@" ;;
    prune-pollution)  cmd_prune_pollution "$@" ;;
    ""|-h|--help|help) usage ;;
    *) err "usage" "unknown command: $cmd"; usage >&2; exit 2 ;;
  esac
}

main "$@"
