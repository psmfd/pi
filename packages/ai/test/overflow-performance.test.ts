import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import type { AssistantMessage } from "../src/types.ts";
import { isContextOverflow } from "../src/utils/overflow.ts";

// Regression for psmfd/pi#74, CodeQL alert 82.
it("preserves Cerebras bodyless error forms and provider scoping", () => {
	for (const text of ["400(no body)", "413\t(no body)", "400\nSTATUS CODE\t(no body) trailing"]) {
		for (const provider of ["cerebras", "openai"]) {
			const message = { stopReason: "error", errorMessage: text, provider } as AssistantMessage;
			expect(isContextOverflow(message)).toBe(provider === "cerebras");
		}
	}
});

it("rejects a long nonmatching bodyless error without backtracking", () => {
	// A child-process deadline can interrupt a synchronous regex regression.
	const source = new URL("../src/utils/overflow.ts", import.meta.url).href;
	execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
		import assert from "node:assert/strict";
		import { isContextOverflow } from ${JSON.stringify(source)};
		assert.equal(isContextOverflow({ stopReason: "error", provider: "cerebras",
			errorMessage: "400" + "\\t".repeat(1_000_000) + "X" }), false);
	`,
		],
		{ timeout: 5000, stdio: "pipe" },
	);
}, 10000);
