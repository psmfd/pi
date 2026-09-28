import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { renderLatex } from "../src/latex.ts";

// Regression for psmfd/pi#74, CodeQL alert 83.
test("normalizes script operators while preserving unrelated whitespace", () => {
	assert.equal(renderLatex("x^{~a~+~-~b~=~c~}"), "xᵃ⁺⁻ᵇ⁼ᶜ");
	assert.equal(renderLatex("x^{a~~~b}"), "x^(a b)");
	assert.equal(renderLatex("x_{~1~-~2~}"), "x₁₋₂");
});

test("renders long script whitespace without backtracking", { timeout: 10000 }, () => {
	const source = new URL("../src/latex.ts", import.meta.url).href;
	execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
		import assert from "node:assert/strict";
		import { renderLatex } from ${JSON.stringify(source)};
		assert.equal(renderLatex("x^{a" + "~".repeat(200_000) + "b}"), "x^(a b)");
	`,
		],
		{ timeout: 5000, stdio: "pipe" },
	);
});
