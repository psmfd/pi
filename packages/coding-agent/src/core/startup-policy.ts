import { isAbsolute, normalize } from "node:path";
import type { Args } from "../cli/args.ts";

/** Host-selected inputs for the closed, keyless managed startup contract. */
export interface ManagedStartupPolicy {
	readonly kind: "managed-v1";
	readonly cwd: string;
	readonly agentDir: string;
	readonly sessionDir: string;
	readonly systemPrompt: string;
	readonly extensionPaths: readonly string[];
}

/** Pure validation: must run before command handlers or configuration I/O. */
export function resolveStartupPolicy(
	args: readonly string[],
	parsed: Args,
	env: NodeJS.ProcessEnv,
	cwd: string,
): ManagedStartupPolicy | undefined {
	if (parsed.startupPolicy === undefined) return undefined;
	if (parsed.startupPolicy !== "managed-v1") throw new Error("Unsupported startup policy");
	if (parsed.diagnostics.length > 0) throw new Error(parsed.diagnostics.map((item) => item.message).join("; "));
	const values = new Set(["--startup-policy", "--mode", "--session-dir", "--system-prompt", "--extension"]);
	const switches = new Set([
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-themes",
		"--no-context-files",
		"--no-approve",
		"--offline",
		"--no-tools",
		"--no-builtin-tools",
		"--help",
		"--version",
	]);
	const seen = new Set<string>();
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!values.has(arg) && !switches.has(arg)) throw new Error(`managed-v1 does not support ${arg}`);
		if (seen.has(arg) && arg !== "--extension") throw new Error(`Duplicate managed option: ${arg}`);
		seen.add(arg);
		if (values.has(arg)) {
			const value = args[++index];
			if (value === undefined) throw new Error(`Missing value for ${arg}`);
			if (arg === "--mode" && value !== "rpc") throw new Error("managed-v1 supports interactive or RPC mode");
		}
	}
	const agentDir = env.PI_CODING_AGENT_DIR;
	const sessionDir = parsed.sessionDir;
	if (!agentDir || !isAbsolute(agentDir) || !sessionDir || !isAbsolute(sessionDir) || !isAbsolute(cwd)) {
		throw new Error("managed-v1 requires absolute cwd, agent and session directories");
	}
	if (env.PI_CODING_AGENT_SESSION_DIR && normalize(env.PI_CODING_AGENT_SESSION_DIR) !== normalize(sessionDir)) {
		throw new Error("managed-v1 session directory inputs disagree");
	}
	if (!parsed.systemPrompt) throw new Error("managed-v1 requires an explicit literal system prompt");
	const extensionPaths = (parsed.extensions ?? []).map((path) => {
		if (!isAbsolute(path)) throw new Error("managed-v1 requires absolute extension file paths");
		return normalize(path);
	});
	if (new Set(extensionPaths).size !== extensionPaths.length) throw new Error("Duplicate managed extension path");
	return Object.freeze({
		kind: "managed-v1",
		cwd: normalize(cwd),
		agentDir: normalize(agentDir),
		sessionDir: normalize(sessionDir),
		systemPrompt: parsed.systemPrompt,
		extensionPaths: Object.freeze(extensionPaths),
	});
}
