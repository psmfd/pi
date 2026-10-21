import type { JsonValue } from "@earendil-works/chord";

type JsonContainer = Record<string, JsonValue> | JsonValue[];

/**
 * Assign `value` at `target[key]` leaf by leaf. Chord records a container assignment as one full set and only emits an
 * append when a string leaf is reassigned with a longer string, so writing the partial whole would store and publish the
 * complete message on every flush.
 */
export function assignJson(target: JsonContainer, key: string | number, value: JsonValue): void {
	if (key === "__proto__" || key === "constructor" || key === "prototype") {
		throw new Error("Reserved JSON assignment key");
	}
	const slots = target as Record<string | number, JsonValue>;
	const current = Object.hasOwn(slots, key) ? slots[key] : undefined;
	// Keep reserved keys as data by assigning their enclosing record as one value.
	// Recursing into an inherited __proto__ would mutate Object.prototype, even
	// when the outer container is a Chord draft.
	if (isRecord(current) && isRecord(value) && !Object.keys(value).some(isReservedKey)) {
		for (const name of Object.keys(current)) if (!Object.hasOwn(value, name)) delete current[name];
		for (const [name, child] of Object.entries(value)) assignJson(current, name, child);
		return;
	}
	if (Array.isArray(current) && Array.isArray(value) && current.length <= value.length) {
		const items = current as JsonValue[];
		for (let index = 0; index < value.length; index++) {
			if (index < items.length) assignJson(items, index, value[index]!);
			else items.push(value[index]!);
		}
		return;
	}
	if (current !== value) slots[key] = value;
}

function isReservedKey(key: string): boolean {
	return key === "__proto__" || key === "constructor" || key === "prototype";
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
