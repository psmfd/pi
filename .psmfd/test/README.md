# Release workflow tests

Run from the fork repository root after `npm ci --ignore-scripts`:

```sh
node --test .psmfd/test/release-preflight.test.mjs
```

The build regression for [#70](https://github.com/psmfd/pi/issues/70) additionally
requires Linux, Bubblewrap with working user/network namespaces, and a Node
installation containing `node`, `npm`, and `npx`. Use Node 22 (the release job's
major version) when qualifying release parity. An unavailable namespace fails
the test; it is not silently treated as offline evidence.

Before the offline phase, hydrate `packages/ai/src/providers/data/` from the
version-matched `@earendil-works/pi-ai` registry tarball, using the release
workflow's hydration procedure. Verify npm integrity and include the hidden
`.manifest.json`; never generate a live provider catalog for this test. Respect
the repository's package-age policy and use `--ignore-scripts` for npm acquisition.
Dependency installation and pinned-data acquisition can require network access.

```sh
node --test .psmfd/test/release-build.test.mjs
```

The test parses the actual release workflow with the existing `yaml` dependency,
checks its workspace order against the root build, and executes its build block.
It copies tracked working-tree source, installed dependencies, and hydrated data
to a disposable tree. Existing workspace `dist` and compiler state are excluded.
The copy is built with an empty environment, isolated home, and a separate network
namespace; only system tools, Node, and the disposable tree are mounted. Generator
entrypoints in the disposable copy fail if invoked, even if a generator would
otherwise catch a network error. The caller's files are not modified.

Success requires fresh durable JavaScript/types, a resolvable public durable
export, the downstream coding-agent bundle, and unchanged model-data hashes.
Two negative cases run from clean outputs: omitting durable must break its public
export, and a failing workspace build must stop the sequence before agent builds.
Each sandbox subprocess has a four-minute cap. Fixture preparation and cleanup
run outside that subprocess cap.

These overlay tests have explicit invocations; the upstream `test.sh` does not
discover `.psmfd/test`. They do not dispatch a release, build cross-platform Bun
executables, attest artifacts, or prove full release readiness. Keep build commands
inline in the workflow: moving them into a script checked out from the release
tag would change where release build instructions are loaded. Maintainers must
still select protected `main` when dispatching the release workflow.
