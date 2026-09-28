import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse } from "yaml";

const workflow = (name) => parse(readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), "utf8"));
const release = workflow("psmfd-release");
const preflight = workflow("psmfd-reusable-preflight");

test("release actions explicitly disable shared caches", () => {
	const steps = release.jobs.build.steps;
	assert.equal(steps.find((step) => step.uses?.startsWith("actions/setup-node@"))?.with["package-manager-cache"], false);
	assert.equal(steps.find((step) => step.uses?.startsWith("oven-sh/setup-bun@"))?.with["no-cache"], true);
	assert.equal(preflight.jobs.preflight.steps[0].with.ref, "main");
});

// PR #74: execute the actual workflow script against local Git history, without dispatching a release.
test("preflight admits main-history tags and rejects off-main, missing, and malformed tags", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-preflight-"));
	const remote = join(dir, "origin");
	const checkout = join(dir, "checkout");
	const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
	try {
		git(dir, "init", "-q", "-b", "main", remote);
		git(remote, "config", "user.name", "Preflight Test");
		git(remote, "config", "user.email", "preflight@example.invalid");
		git(remote, "commit", "-q", "--allow-empty", "-m", "main base");
		const mainBase = git(remote, "rev-parse", "HEAD");
		git(remote, "tag", "v1.0.0-psmfd.1");
		git(remote, "tag", "-a", "v1.0.0-psmfd.2", "-m", "annotated");
		git(remote, "checkout", "-q", "-b", "off-main");
		git(remote, "commit", "-q", "--allow-empty", "-m", "unmerged");
		git(remote, "tag", "v1.0.0-psmfd.3");
		git(remote, "checkout", "-q", "main");
		git(remote, "commit", "-q", "--allow-empty", "-m", "main advances");
		git(dir, "clone", "-q", "--no-local", "--no-tags", remote, checkout);
		const script = join(dir, "preflight.sh");
		writeFileSync(script, preflight.jobs.preflight.steps.find((step) => step.id === "check").run);
		for (const [tag, accepted] of [
			["v1.0.0-psmfd.1", true], ["v1.0.0-psmfd.2", true],
			["v1.0.0-psmfd.3", false], ["v1.0.0-psmfd.99", false], ["--upload-pack=bad", false],
		]) {
			const output = join(dir, "outputs");
			writeFileSync(output, "");
			const result = spawnSync("bash", [script], { cwd: checkout, encoding: "utf8", env: {
				...process.env, TAG: tag, TAG_PATTERN: release.jobs.preflight.with.tag_pattern, GITHUB_OUTPUT: output,
			} });
			assert.ifError(result.error);
			assert.equal(result.status === 0, accepted, `${tag}: ${result.stderr}`);
			assert.equal(readFileSync(output, "utf8"), accepted ? `tag=${tag}\ntag_sha=${mainBase}\n` : "");
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
