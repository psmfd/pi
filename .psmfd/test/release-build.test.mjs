import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const release = parse(readFileSync(join(root, ".github/workflows/psmfd-release.yml"), "utf8"));
const steps = release.jobs.build.steps.filter((step) => step.name === "Build packages (hermetic — skip network model generation)");
assert.equal(steps.length, 1, "expected exactly one hermetic build step");
const script = steps[0].run;
assert.equal(typeof script, "string");
assert.equal(steps[0].env, undefined, "test must model new step environment explicitly");
assert.equal(steps[0]["working-directory"], undefined);
assert.equal(steps[0].shell, undefined);
assert.ok(!script.includes("${{"), "build expressions need explicit test handling");

const commands = script.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
assert.equal(commands.shift(), "set -euo pipefail");
const sequence = commands.map((command) => {
	const match = /^\(cd (packages\/[a-z/-]+) && (npm run build|npx tsgo -p tsconfig\.build\.json)\)$/.exec(command);
	assert.ok(match, `unmodeled release command: ${command}`);
	assert.equal(match[2], match[1] === "packages/ai" ? "npx tsgo -p tsconfig.build.json" : "npm run build");
	return match[1];
});
const rootBuild = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.build.split(" && ");
const rootSequence = [];
let current = ".";
for (let i = 0; i < rootBuild.length; i += 2) {
	assert.match(rootBuild[i], /^cd [a-z./-]+$/);
	assert.equal(rootBuild[i + 1], "npm run build");
	current = normalize(join(current, rootBuild[i].slice(3)));
	assert.ok(current.startsWith("packages/"));
	rootSequence.push(current);
}

test("release workspace order matches the root build without AI generation (#70)", () => {
	assert.deepEqual(sequence, rootSequence);
});

function modelHashes(dir) {
	const names = readdirSync(dir).sort();
	assert.ok(names.includes(".manifest.json"), "hydrate version-matched model data before running");
	assert.ok(names.length > 1);
	return names.map((name) => [name, createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")]);
}

// #70: real compilers and the actual workflow block, not mocked npm commands.
test("release builds clean outputs offline and detects the durable omission (#70)", { timeout: 600_000 }, () => {
	assert.equal(process.platform, "linux", "this integration test requires Linux and bubblewrap");
	const fixture = mkdtempSync(join(tmpdir(), "pi-release-build-"));
	try {
		// Only tracked source, read from the working tree: no old dist, incremental
		// state, operator files, or untracked build products can mask the omission.
		const paths = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
		for (const path of paths) {
			assert.ok(!path.split("/").includes("dist") && !path.endsWith(".tsbuildinfo"), `tracked build output: ${path}`);
			mkdirSync(dirname(join(fixture, path)), { recursive: true });
			cpSync(join(root, path), join(fixture, path), { verbatimSymlinks: true });
		}
		// Preserve relative npm workspace links so they resolve inside the fixture.
		const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
		const dependencyRoots = new Set(["node_modules"]);
		for (const path of Object.keys(lock.packages)) {
			const index = path.indexOf("/node_modules/");
			if (!path.startsWith("node_modules/") && index >= 0) dependencyRoots.add(path.slice(0, index + 13));
		}
		for (const path of dependencyRoots) {
			if (existsSync(join(root, path))) cpSync(join(root, path), join(fixture, path), { recursive: true, verbatimSymlinks: true });
		}
		const dataPath = "packages/ai/src/providers/data";
		const before = modelHashes(join(root, dataPath));
		cpSync(join(root, dataPath), join(fixture, dataPath), { recursive: true });
		// A generator that catches a failed network request must still fail the test.
		// Replace only generator entrypoints in this disposable copy, never sources.
		for (const name of ["generate-models.ts", "generate-image-models.ts"]) {
			writeFileSync(join(fixture, "packages/ai/scripts", name), 'throw new Error("LIVE_CATALOG_GENERATION_FORBIDDEN");\n');
		}
		const nodeRoot = resolve(dirname(realpathSync(process.execPath)), "..");
		const run = (body) => {
			writeFileSync(join(fixture, "release-build.sh"), body);
			return spawnSync("bwrap", [
				"--die-with-parent", "--unshare-net", "--unshare-pid", "--new-session", "--clearenv",
				"--ro-bind", "/usr", "/usr", "--symlink", "usr/bin", "/bin", "--symlink", "usr/lib", "/lib",
				"--symlink", "usr/lib64", "/lib64", "--ro-bind", nodeRoot, "/node",
				"--bind", fixture, "/work", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
				"--setenv", "PATH", "/node/bin:/usr/bin:/bin", "--setenv", "HOME", "/tmp/home",
				"--setenv", "LANG", "C.UTF-8", "--setenv", "npm_config_offline", "true",
				"--setenv", "npm_config_cache", "/tmp/npm-cache", "--chdir", "/work",
				"--", "bash", "release-build.sh",
			], { encoding: "utf8", timeout: 240_000, killSignal: "SIGKILL", maxBuffer: 16 * 1024 * 1024 });
		};
		// No route outside the new namespace; verify the isolation is actually active.
		const probe = run('set -euo pipefail\nnode -e \'const n=require("node:os").networkInterfaces(); if(Object.values(n).flat().some(x=>!x.internal)) process.exit(1)\'\n');
		assert.ifError(probe.error);
		assert.equal(probe.status, 0, `network isolation unavailable: ${probe.stderr}`);
		const result = run(script);
		assert.ifError(result.error);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		console.log(result.stdout);
		assert.deepEqual(modelHashes(join(fixture, dataPath)), before);
		assert.ok(existsSync(join(fixture, "packages/durable/dist/index.js")));
		assert.ok(existsSync(join(fixture, "packages/durable/dist/index.d.ts")));
		assert.ok(existsSync(join(fixture, "packages/coding-agent/dist/bundle/cli.js")));
		assert.doesNotMatch(result.stdout + result.stderr, /LIVE_CATALOG_GENERATION_FORBIDDEN/);
		const importDurable = '\nnode --input-type=module -e "await import(\'@earendil-works/pi-durable\')"\n';
		const exported = run(`set -euo pipefail${importDurable}`);
		assert.ifError(exported.error);
		assert.equal(exported.status, 0, exported.stdout + exported.stderr);
		console.log("Actual release workspace sequence passed offline; pinned model bytes preserved.");
		// Repeat from clean outputs with the original omission. Some workspace
		// consumers don't import durable yet; require its public entry to resolve.
		for (const path of rootSequence) rmSync(join(fixture, path, "dist"), { recursive: true, force: true });
		const durable = "(cd packages/durable && npm run build)";
		assert.equal(script.split(durable).length, 2);
		const smoke = run(`set -euo pipefail${importDurable}`);
		// The positive build was cleaned above, so this also checks that no source
		// condition or installed registry copy can satisfy the public dist export.
		assert.notEqual(smoke.status, 0);
		assert.ifError(smoke.error);
		const omitted = run(script.replace(durable, "") + importDurable);
		assert.ifError(omitted.error);
		assert.notEqual(omitted.status, 0);
		assert.match(omitted.stdout + omitted.stderr, /(?:Cannot find module|Could not resolve).*durable/);
		assert.deepEqual(modelHashes(join(fixture, dataPath)), before);
		console.log("Omitting durable fails public dist export resolution, as expected.");
		for (const path of rootSequence) rmSync(join(fixture, path, "dist"), { recursive: true, force: true });
		const failed = run(script.replace(durable, "(exit 42)"));
		assert.ifError(failed.error);
		assert.equal(failed.status, 42, failed.stdout + failed.stderr);
		assert.ok(!existsSync(join(fixture, "packages/agent/dist")), "continued after failed workspace build");
	} finally {
		rmSync(fixture, { recursive: true, force: true });
	}
});
