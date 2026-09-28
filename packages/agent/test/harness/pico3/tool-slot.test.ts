import { expect, it } from "vitest";
import { Harness } from "../../../src/harness/pico3/harness.ts";
import { type ToolCheckpoint, type ToolInput, tool } from "../../../src/harness/pico3/kinds/tool.ts";
import { MemoryStorage } from "../../../src/harness/pico3/memory.ts";
import { Session } from "../../../src/harness/pico3/session.ts";
import { getToolSlot } from "../../../src/harness/pico3/tool-slot.ts";
import type { StickyState, Task, ToolSlot } from "../../../src/harness/pico3/types.ts";
import { ctx, fake } from "./helpers.ts";

const invalidIndices = ["__proto__", "constructor", "0", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 1];
const slot = (): ToolSlot => ({ callId: "call", name: "example", args: {}, status: "running", waitingOn: "hook" });

async function seed(index: unknown) {
	const storage = new MemoryStorage();
	const task: Task<ToolInput, ToolCheckpoint> = {
		id: 2,
		conversationId: 1,
		kind: "pi.tool",
		status: "pending",
		owns: [],
		after: [],
		input: {
			assistant: 3,
			call: { type: "toolCall", id: "call", name: "example", arguments: {} },
			offered: ["example"],
			index: index as number,
		},
	};
	await storage.commit(
		[
			{ type: "conversation", conversation: { id: 1 } },
			{ type: "doc", ref: { doc: "rewindable", conversationId: 1 }, ops: [["r", { plugins: {} }]] },
			{
				type: "doc",
				ref: { doc: "sticky", conversationId: 1 },
				ops: [["r", { inbox: [], turn: { tools: [slot()] }, tasks: {}, plugins: {} }]],
			},
			{ type: "task", task },
		],
		ctx,
	);
	return { storage, task };
}

// Regression for psmfd/pi#74, CodeQL alert 86. Exercise the real document proxies.
it.each(invalidIndices)("rejects toolSlot index %s before accessing a slot", async (index) => {
	const { storage, task } = await seed(index);
	const session = new Session(storage, new Map(), new Map());
	try {
		await expect(
			session.commit(
				{ type: "kernel", conversationId: 1 },
				(tx) => {
					tx.toolSlot(task).status = "done";
				},
				ctx,
				{ docs: [{ doc: "sticky", conversationId: 1 }] },
			),
		).rejects.toThrow(/no tool slot/);
	} finally {
		await session.close(ctx);
	}
});

it.each([...invalidIndices, 0])("aborts index %s without modifying a different slot or a prototype", async (index) => {
	const { storage, task } = await seed(index);
	const session = new Session(storage, new Map(), new Map());
	const descriptors = Object.getOwnPropertyDescriptors(Array.prototype);
	try {
		const runtime = { now: () => 0 } as Parameters<typeof tool.abort>[1];
		const close = await tool.abort(task, runtime, ctx);
		await session.commit({ type: "kernel", conversationId: 1 }, (tx) => close(tx, task, ctx), ctx, {
			docs: [{ doc: "sticky", conversationId: 1 }],
		});
		const sticky = (await storage.doc({ doc: "sticky", conversationId: 1 }, ctx)) as unknown as StickyState;
		expect(sticky.turn.tools[0]?.status).toBe(index === 0 ? "aborted" : "running");
		expect(sticky.turn.tools[0]?.waitingOn).toBe(index === 0 ? undefined : "hook");
		for (const key of ["status", "entry", "waitingOn"]) {
			expect(Object.getOwnPropertyDescriptor(Array.prototype, key)).toEqual(descriptors[key]);
		}
	} finally {
		// Keep a failing regression from contaminating other tests.
		for (const key of ["status", "entry", "waitingOn"]) {
			const descriptor = descriptors[key];
			if (descriptor) Object.defineProperty(Array.prototype, key, descriptor);
			else Reflect.deleteProperty(Array.prototype, key);
		}
		await session.close(ctx);
	}
});

it("ignores inherited numeric slots and holes but returns an owned slot", () => {
	const tools: ToolSlot[] = [slot()];
	tools.length = 3;
	Object.setPrototypeOf(tools, { 1: slot() });
	expect(getToolSlot(tools, 0)).toBe(tools[0]);
	expect(getToolSlot(tools, 1)).toBeUndefined();
	expect(getToolSlot(tools, 2)).toBeUndefined();
});

it.each(["0", "__proto__", 0])("suspension only clears the owned numeric slot for index %s", async (index) => {
	const { storage } = await seed(index);
	const harness = await Harness.open(storage, { models: fake({ respond: () => ({ text: "unused" }) }) }, ctx);
	await harness.suspend(ctx);
	const sticky = (await storage.doc({ doc: "sticky", conversationId: 1 }, ctx)) as unknown as StickyState;
	expect(sticky.turn.tools[0]?.waitingOn).toBe(index === 0 ? undefined : "hook");
});
