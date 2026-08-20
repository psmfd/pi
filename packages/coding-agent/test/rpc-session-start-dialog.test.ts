import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

// PSMFD-Patch: psmfd-patch-012 (psmfd/pi#57) — a dialog awaited inside a
// session_start hook must be answerable over RPC. Before this patch the stdin
// reader attached only after session_start hooks completed, so the await
// deadlocked and pi exited 0 silently once the event loop drained.
//
// Spawns the BUILT cli (node dist/cli.js) with a hermetic HOME and a fixture
// extension, so it self-skips when dist/ has not been built. Keyless: the
// dialog round-trip happens before any model use.

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, "..", "dist", "cli.js");

const tempDirs: string[] = [];
let child: ChildProcess | null = null;

afterEach(() => {
	child?.kill("SIGKILL");
	child = null;
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

const FIXTURE = `
export default function sessionStartDialog(pi) {
	pi.on("session_start", async (_event, ctx) => {
		const ok = await ctx.ui.confirm("patch-012", "answerable during session_start?");
		ctx.ui.notify("confirm-resolved:" + ok, "info");
	});
}
`;

describe.skipIf(!existsSync(cliPath))("session_start dialog over RPC (psmfd-patch-012)", () => {
	test("is answerable, and the child survives until stdin EOF", async () => {
		const home = mkdtempSync(join(tmpdir(), "pi-p012-home-"));
		tempDirs.push(home);
		const fixturePath = join(home, "fixture.ts");
		writeFileSync(fixturePath, FIXTURE);

		const proc = spawn("node", [cliPath, "--mode", "rpc", "--extension", fixturePath], {
			cwd: home,
			env: {
				...process.env,
				HOME: home,
				PI_CODING_AGENT_DIR: join(home, "agent"),
			},
			stdio: ["pipe", "pipe", "pipe"],
		});
		child = proc;

		let stderr = "";
		proc.stderr?.on("data", (d) => {
			stderr += d.toString();
		});

		const exit = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
			proc.once("exit", (code, signal) => resolve({ code, signal }));
		});

		const notified = await new Promise<string>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`timed out waiting for the dialog round-trip. stderr: ${stderr}`)),
				30_000,
			);
			exit.then((r) => {
				clearTimeout(timer);
				reject(
					new Error(
						`pi exited (code=${r.code} signal=${r.signal}) before the dialog round-trip completed ` +
							`— the psmfd/pi#57 silent-death mode. stderr: ${stderr}`,
					),
				);
			});
			const rl = readline.createInterface({ input: proc.stdout! });
			rl.on("line", (line) => {
				let frame: Record<string, unknown>;
				try {
					frame = JSON.parse(line);
				} catch {
					return;
				}
				if (frame.type !== "extension_ui_request") return;
				if (frame.method === "confirm") {
					proc.stdin?.write(
						`${JSON.stringify({ type: "extension_ui_response", id: frame.id, confirmed: true })}\n`,
					);
					return;
				}
				if (frame.method === "notify" && typeof frame.message === "string") {
					clearTimeout(timer);
					resolve(frame.message);
				}
			});
		});

		expect(notified).toBe("confirm-resolved:true");

		// Clean shutdown still works: EOF on stdin ends the process with 0.
		proc.stdin?.end();
		const result = await exit;
		expect(result.code).toBe(0);
	}, 60_000);
});
