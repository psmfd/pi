import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { formatSkillInvocation } from "../../src/harness/skills.ts";

// Regression for psmfd/pi#74, CodeQL alert 60.
it.each([
	["/SKILL.md", "/"],
	["/skills/example/SKILL.md///", "/skills/example"],
	["C:\\SKILL.md", "C:\\"],
	["C:\\skills\\SKILL.md\\/", "C:\\skills"],
	["///", "/"],
])("preserves the parent directory of %s", (filePath, parent) => {
	expect(
		formatSkillInvocation({
			name: "example",
			description: "example",
			content: "body",
			filePath,
			disableModelInvocation: false,
		}),
	).toContain(`References are relative to ${parent}.`);
});

it("formats long nonmatching separator runs without backtracking", () => {
	const source = new URL("../../src/harness/skills.ts", import.meta.url).href;
	execFileSync(
		process.execPath,
		[
			"--input-type=module",
			"-e",
			`
		import assert from "node:assert/strict";
		import { formatSkillInvocation } from ${JSON.stringify(source)};
		for (const separator of ["/", "\\\\"]) {
			const parent = "x" + separator.repeat(1_000_000);
			assert.ok(formatSkillInvocation({ name: "example", content: "body", filePath: parent + "x" })
				.includes("References are relative to " + parent.slice(0, -1) + "."));
		}
	`,
		],
		{ timeout: 5000, stdio: "pipe" },
	);
}, 10000);
