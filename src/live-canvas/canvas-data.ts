// Helpers for plugin-owned top-level keys in .canvas data. Obsidian's canvas
// save spreads unknown top-level keys back in, so a key survives its saves.

export interface KeyedRead<T> {
	value: T;
	corrupt: boolean;
}

// A missing key reads as `empty()`; a value that fails `parse` reads as
// `empty()` and is flagged corrupt.
export function readKeyed<T>(
	canvasData: unknown,
	key: string,
	parse: (value: unknown) => T | null,
	empty: () => T,
): KeyedRead<T> {
	const raw = isRecord(canvasData) ? canvasData[key] : undefined;
	if (raw === undefined) return { value: empty(), corrupt: false };
	const value = parse(raw);
	return value ? { value, corrupt: false } : { value: empty(), corrupt: true };
}

// The keys to assign onto canvas data. Never includes nodes, edges, or any
// other key. A corrupt value is moved to `corruptKey` rather than overwritten.
export function keyedPatch<T>(
	canvasData: unknown,
	key: string,
	corruptKey: string,
	parse: (value: unknown) => T | null,
	value: T,
): Record<string, unknown> {
	const patch: Record<string, unknown> = { [key]: value };
	const raw = isRecord(canvasData) ? canvasData[key] : undefined;
	if (raw !== undefined && !parse(raw)) patch[corruptKey] = raw;
	return patch;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
