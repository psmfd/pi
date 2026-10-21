import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../src/cli/args.ts";
import { type CreateAgentSessionRuntimeFactory, createAgentSessionRuntime } from "../src/core/agent-session-runtime.ts";
import { createAgentSessionFromServices, createAgentSessionServices } from "../src/core/agent-session-services.ts";
import { AuthStorage } from "../src/core/auth-storage.ts";
import { ManagedResourceLoader } from "../src/core/managed-resource-loader.ts";
import { ModelConfig } from "../src/core/model-config.ts";
import { DefaultPackageManager } from "../src/core/package-manager.ts";
import { DefaultResourceLoader } from "../src/core/resource-loader.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { type ManagedStartupPolicy, resolveStartupPolicy } from "../src/core/startup-policy.ts";

// Regression: https://github.com/psmfd/pi/issues/80
// Actual CLI startup and migration ordering are also exercised by FingerTrap's
// digest-selected executable qualifier; these tests cover the policy boundaries.
describe("managed-v1 startup policy", () => {
	let root: string;
	let cwd: string;
	let agentDir: string;
	let sessionDir: string;
	let argv: string[];
	beforeEach(() => {
		root = realpathSync(mkdtempSync(join(tmpdir(), "pi-managed-test-")));
		cwd = join(root, "project");
		agentDir = join(root, "agent");
		sessionDir = join(root, "sessions");
		for (const path of [cwd, agentDir, sessionDir]) mkdirSync(path);
		vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
		argv = ["--startup-policy", "managed-v1", "--session-dir", sessionDir, "--system-prompt", "literal"];
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		rmSync(root, { recursive: true, force: true });
	});
	function policy(args = argv): ManagedStartupPolicy {
		return resolveStartupPolicy(args, parseArgs(args), { PI_CODING_AGENT_DIR: agentDir }, cwd)!;
	}
	it("leaves ordinary CLI input outside the opt-in policy", () => {
		const args = ["--resume", "previous", "hello"];
		expect(resolveStartupPolicy(args, parseArgs(args), {}, cwd)).toBeUndefined();
	});
	it("freezes explicit inputs and preserves a filename-shaped prompt literally", () => {
		const prompt = join(root, "prompt.md");
		writeFileSync(prompt, "ambient content");
		argv[argv.length - 1] = prompt;
		const resolved = policy();
		expect(resolved.systemPrompt).toBe(prompt);
		expect(Object.isFrozen(resolved)).toBe(true);
		expect(Object.isFrozen(resolved.extensionPaths)).toBe(true);
	});
	it.each([
		["install", "npm:package"],
		["auth", "login"],
		["config"],
		["--resume", "file"],
		["--continue"],
		["--session", "file"],
		["--system-prompt-file", "file"],
		["--project-trust"],
		["--provider", "openai"],
		["--api-key", "synthetic"],
		["--extension", "npm:package"],
		["--extension", "relative.mjs"],
		["--mode", "json"],
		["--startup-policy", "managed-v1"],
		["--unknown"],
		["@prompt.md"],
		["hello"],
	])("rejects unsupported input before resource construction: %j", (...extra) => {
		expect(() => policy([...argv, ...extra])).toThrow();
	});
	it("rejects unknown versions, missing roots, conflicting roots and duplicate extension identities", () => {
		expect(() => policy(argv.map((value) => (value === "managed-v1" ? "managed-v2" : value)))).toThrow();
		expect(() => resolveStartupPolicy(argv, parseArgs(argv), {}, cwd)).toThrow();
		expect(() =>
			resolveStartupPolicy(
				argv,
				parseArgs(argv),
				{
					PI_CODING_AGENT_DIR: agentDir,
					PI_CODING_AGENT_SESSION_DIR: join(root, "other"),
				},
				cwd,
			),
		).toThrow();
		const path = join(root, "explicit.mjs");
		expect(() => policy([...argv, "--extension", path, "--extension", path])).toThrow();
	});
	it("loads only explicit files exactly once per reload and never reads prompt/context files", async () => {
		const log = join(root, "loads.txt");
		const explicit = join(root, "explicit.mjs");
		writeFileSync(
			explicit,
			`import { appendFileSync } from "node:fs"; export default () => appendFileSync(new URL("./loads.txt", import.meta.url), "load\\n");`,
		);
		mkdirSync(join(cwd, ".pi", "extensions"), { recursive: true });
		writeFileSync(join(cwd, ".pi", "extensions", "bad.mjs"), "throw new Error('ambient loaded');");
		writeFileSync(join(cwd, "AGENTS.md"), "ambient content");
		writeFileSync(join(agentDir, "SYSTEM.md"), "ambient content");
		const loader = new ManagedResourceLoader(policy([...argv, "--extension", explicit]));
		await loader.reload();
		await loader.reload();
		expect(readFileSync(log, "utf8")).toBe("load\nload\n");
		expect(loader.getExtensions().extensions).toHaveLength(1);
		expect(loader.getSystemPrompt()).toBe("literal");
		expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
		expect(loader.getAppendSystemPrompt()).toEqual([]);
		expect(loader.getSkills().skills).toEqual([]);
		expect(loader.getPrompts().prompts).toEqual([]);
		expect(loader.getThemes().themes).toEqual([]);
		expect(() =>
			loader.extendResources({
				themePaths: [{ path: explicit, metadata: { source: "explicit", scope: "user", origin: "top-level" } }],
			}),
		).toThrow("resource expansion");
	});
	it("rejects directories, symlinks and failed explicit extension loads", async () => {
		const explicit = join(root, "broken.mjs");
		writeFileSync(explicit, "throw new Error('broken explicit');");
		const linked = join(root, "linked.mjs");
		symlinkSync(explicit, linked);
		for (const path of [cwd, linked, explicit]) {
			await expect(new ManagedResourceLoader(policy([...argv, "--extension", path])).reload()).rejects.toThrow();
		}
	});
	it("keeps settings, auth and model configuration in memory across reload and new sessions", async () => {
		for (const name of ["settings.json", "auth.json", "models.json", "models-store.json"]) {
			writeFileSync(join(agentDir, name), "{invalid ambient config");
		}
		// These traps fail even for a harmless read or an offline package lookup.
		const implicitRead = () => {
			throw new Error("implicit configuration path reached");
		};
		vi.spyOn(SettingsManager, "create").mockImplementation(implicitRead);
		vi.spyOn(AuthStorage, "create").mockImplementation(implicitRead);
		vi.spyOn(DefaultResourceLoader.prototype, "reload").mockImplementation(implicitRead);
		vi.spyOn(DefaultPackageManager.prototype, "resolve").mockImplementation(implicitRead);
		const modelConfigLoad = vi.spyOn(ModelConfig, "load");
		const selectedPolicy = policy();
		const factory: CreateAgentSessionRuntimeFactory = async ({ cwd: nextCwd, sessionManager, sessionStartEvent }) => {
			const services = await createAgentSessionServices({ cwd: nextCwd, agentDir, startupPolicy: selectedPolicy });
			expect(services.settingsManager.getCacheWarmingMode()).toBe("off");
			return {
				...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent, noTools: "all" })),
				services,
				diagnostics: services.diagnostics,
			};
		};
		const runtime = await createAgentSessionRuntime(factory, {
			cwd,
			agentDir,
			sessionManager: SessionManager.create(cwd, sessionDir),
		});
		try {
			await runtime.session.bindExtensions({});
			await runtime.session.reload();
			expect(runtime.services.settingsManager.getCacheWarmingMode()).toBe("off");
			await runtime.newSession();
			expect(runtime.cwd).toBe(cwd);
			expect(modelConfigLoad).toHaveBeenCalled();
			expect(modelConfigLoad.mock.calls.every(([path]) => path === undefined)).toBe(true);
			expect(runtime.session.systemPrompt).toContain("literal");
			expect(runtime.session.sessionManager.getSessionDir()).toBe(sessionDir);
			const session = runtime.session;
			await expect(runtime.switchSession(join(root, "missing.jsonl"))).rejects.toThrow("managed-v1");
			await expect(runtime.importFromJsonl(join(root, "missing.jsonl"))).rejects.toThrow("managed-v1");
			await expect(runtime.fork("entry")).rejects.toThrow("managed-v1");
			await expect(runtime.newSession({ parentSession: join(root, "parent.jsonl") })).rejects.toThrow("managed-v1");
			expect(runtime.session).toBe(session);
			await expect(
				createAgentSessionServices({ cwd: root, agentDir, startupPolicy: selectedPolicy }),
			).rejects.toThrow("roots");
			for (const name of ["settings.json", "auth.json", "models.json", "models-store.json"]) {
				expect(readFileSync(join(agentDir, name), "utf8")).toBe("{invalid ambient config");
			}
			expect(existsSync(join(agentDir, "trust.json"))).toBe(false);
		} finally {
			await runtime.dispose();
		}
	});
});
