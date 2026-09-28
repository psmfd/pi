import type { ToolSlot } from "./types.ts";

/** Stored task input must identify an owned array element, never an inherited property. */
export function getToolSlot(tools: readonly ToolSlot[], index: unknown): ToolSlot | undefined {
	if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || !Object.hasOwn(tools, index)) {
		return undefined;
	}
	return tools[index];
}
