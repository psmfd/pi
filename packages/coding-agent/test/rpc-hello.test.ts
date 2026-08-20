import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { VERSION } from "../src/config.ts";
import { RpcClient } from "../src/modes/rpc/rpc-client.ts";
import { helloFrame, RPC_CAPABILITIES, RPC_PROTOCOL_VERSION } from "../src/modes/rpc/rpc-mode.ts";

// PSMFD-Patch: psmfd-patch-010 (psmfd/pi#56) — the RPC hello line and the
// reference client's hello-based ready gate. Keyless: the child side is a
// scripted stdio double, same seam as rpc-client-process-exit.test.ts.

const tempDirs: string[] = [];

function writeChildScript(contents: string): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-rpc-hello-"));
	tempDirs.push(dir);
	const path = join(dir, "child.mjs");
	writeFileSync(path, contents);
	return path;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("hello frame", () => {
	test("carries version, protocol, and capabilities", () => {
		const frame = helloFrame();
		expect(frame.type).toBe("hello");
		expect(frame.piVersion).toBe(VERSION);
		expect(frame.protocol).toBe(RPC_PROTOCOL_VERSION);
		expect(frame.capabilities).toEqual([...RPC_CAPABILITIES]);
		for (const cap of ["extension_ui", "queue_modes", "fork", "get_commands"]) {
			expect(frame.capabilities).toContain(cap);
		}
	});
});

describe("RpcClient hello gating", () => {
	test("consumes the hello line as the ready gate", async () => {
		const client = new RpcClient({
			cliPath: writeChildScript(`
process.stdout.write(JSON.stringify({ type: "hello", piVersion: "9.9.9-test", protocol: 1, capabilities: ["extension_ui"] }) + "\\n");
process.stdin.resume();
`),
			// Generous: a loaded machine can take >250ms just to start node.
			helloGraceMs: 10_000,
		});
		const events: unknown[] = [];
		client.onEvent((event) => events.push(event));
		await client.start();
		try {
			expect(client.hello).toEqual({
				type: "hello",
				piVersion: "9.9.9-test",
				protocol: 1,
				capabilities: ["extension_ui"],
			});
			// The handshake frame is not a session event.
			expect(events).toEqual([]);
		} finally {
			await client.stop();
		}
	});

	test("falls back to the legacy grace for a child that never says hello", async () => {
		const client = new RpcClient({
			cliPath: writeChildScript(`
process.stdin.resume();
`),
		});
		await client.start();
		try {
			expect(client.hello).toBeNull();
		} finally {
			await client.stop();
		}
	});

	test("refuses a protocol newer than supported, naming both versions", async () => {
		const client = new RpcClient({
			cliPath: writeChildScript(`
process.stdout.write(JSON.stringify({ type: "hello", piVersion: "9.9.9-test", protocol: 99, capabilities: [] }) + "\\n");
process.stdin.resume();
`),
			helloGraceMs: 10_000,
		});
		try {
			await expect(client.start()).rejects.toThrow(/protocol 99[\s\S]*supports 1/);
		} finally {
			await client.stop();
		}
	});
});
