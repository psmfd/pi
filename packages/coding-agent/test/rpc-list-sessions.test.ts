import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import type { SessionHeader, SessionInfo } from "../src/core/session-manager.ts";
import { SessionManager } from "../src/core/session-manager.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { RpcClient } from "../src/modes/rpc/rpc-client.ts";
import { listSessionsForRpc, RPC_CAPABILITIES, toRpcSessionInfo } from "../src/modes/rpc/rpc-mode.ts";

// PSMFD-Patch: psmfd-patch-011 (psmfd/pi#54) — the list_sessions RPC command:
// SessionManager.list()/.listAll() exposed as header fields only, with
// allMessagesText deliberately kept off the wire (it scales with transcript
// size; pickers need firstMessage at most).

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

function createSessionFile(path: string, id: string, cwd: string): void {
	const header: SessionHeader = {
		type: "session",
		id,
		version: 3,
		timestamp: new Date(0).toISOString(),
		cwd,
	};
	writeFileSync(path, `${JSON.stringify(header)}\n`, "utf8");
	const mgr = SessionManager.open(path);
	mgr.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: "hello from the fixture" }],
		api: "openai-completions",
		provider: "openai",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});
	// firstMessage derives from the first USER message only.
	mgr.appendMessage({
		role: "user",
		content: [{ type: "text", text: "hello from the fixture" }],
		timestamp: Date.now(),
	});
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("toRpcSessionInfo", () => {
	test("projects header fields and keeps allMessagesText off the wire", () => {
		const info: SessionInfo = {
			path: "/tmp/s.jsonl",
			id: "sess-1",
			cwd: "/tmp/project",
			name: "named",
			parentSessionPath: "/tmp/parent.jsonl",
			created: new Date("2026-08-20T10:00:00.000Z"),
			modified: new Date("2026-08-20T11:00:00.000Z"),
			messageCount: 3,
			firstMessage: "first",
			allMessagesText: "first second third — potentially megabytes",
		};
		const wire = toRpcSessionInfo(info);
		expect(wire).toEqual({
			path: "/tmp/s.jsonl",
			id: "sess-1",
			cwd: "/tmp/project",
			name: "named",
			parentSessionPath: "/tmp/parent.jsonl",
			created: "2026-08-20T10:00:00.000Z",
			modified: "2026-08-20T11:00:00.000Z",
			messageCount: 3,
			firstMessage: "first",
		});
		expect("allMessagesText" in wire).toBe(false);
	});
});

describe("listSessionsForRpc", () => {
	beforeAll(() => initTheme("dark"));

	test("lists real session files, projected", async () => {
		const sessionDir = makeTempDir("pi-rpc-list-");
		createSessionFile(join(sessionDir, "a.jsonl"), "sess-a", "/tmp/project");
		const sessions = await listSessionsForRpc({ cwd: "/tmp/project", sessionDir });
		expect(sessions).toHaveLength(1);
		expect(sessions[0].id).toBe("sess-a");
		expect(sessions[0].messageCount).toBe(2);
		expect(sessions[0].firstMessage).toContain("hello from the fixture");
		expect(typeof sessions[0].created).toBe("string");
		expect("allMessagesText" in sessions[0]).toBe(false);
	});
});

describe("capabilities", () => {
	test("hello advertises list_sessions", () => {
		expect(RPC_CAPABILITIES).toContain("list_sessions");
	});
});

describe("RpcClient.listSessions", () => {
	test("round-trips the command through a scripted child", async () => {
		const dir = makeTempDir("pi-rpc-list-child-");
		const childPath = join(dir, "child.mjs");
		writeFileSync(
			childPath,
			`
import * as readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
	const cmd = JSON.parse(line);
	if (cmd.type === "list_sessions") {
		process.stdout.write(JSON.stringify({
			id: cmd.id,
			type: "response",
			command: "list_sessions",
			success: true,
			data: { sessions: [{ path: "/tmp/s.jsonl", id: "sess-child", cwd: cmd.cwd ?? "", created: "2026-08-20T10:00:00.000Z", modified: "2026-08-20T10:00:00.000Z", messageCount: 1, firstMessage: "hi" }] },
		}) + "\\n");
	}
});
`,
		);
		const client = new RpcClient({ cliPath: childPath });
		await client.start();
		try {
			const result = await client.listSessions({ cwd: "/tmp/project" });
			expect(result.sessions).toHaveLength(1);
			expect(result.sessions[0].id).toBe("sess-child");
			expect(result.sessions[0].cwd).toBe("/tmp/project");
		} finally {
			await client.stop();
		}
	});
});
