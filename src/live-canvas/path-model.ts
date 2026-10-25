export interface CanvasPath {
	id: string;
	name: string;
	edgeIds: string[];
}

export interface CanvasPathSet {
	version: 1;
	canvasPath: string;
	paths: CanvasPath[];
}

export type NameCheck = { ok: true; name: string } | { ok: false; reason: "empty" | "duplicate" };

export interface EdgeEnds {
	id: string;
	fromNode: string;
	toNode: string;
}

export function emptyPathSet(canvasPath: string): CanvasPathSet {
	return { version: 1, canvasPath, paths: [] };
}

export function checkPathName(set: CanvasPathSet, name: string, exceptId?: string): NameCheck {
	const trimmed = name.trim();
	if (!trimmed) return { ok: false, reason: "empty" };
	const lower = trimmed.toLowerCase();
	const taken = set.paths.some((p) => p.id !== exceptId && p.name.toLowerCase() === lower);
	return taken ? { ok: false, reason: "duplicate" } : { ok: true, name: trimmed };
}

export function addPath(set: CanvasPathSet, id: string, name: string): CanvasPathSet {
	return { ...set, paths: [...set.paths, { id, name: name.trim(), edgeIds: [] }] };
}

export function renamePath(set: CanvasPathSet, id: string, name: string): CanvasPathSet {
	return mapPath(set, id, (p) => ({ ...p, name: name.trim() }));
}

export function deletePath(set: CanvasPathSet, id: string): CanvasPathSet {
	return { ...set, paths: set.paths.filter((p) => p.id !== id) };
}

export function toggleEdge(set: CanvasPathSet, pathId: string, edgeId: string): CanvasPathSet {
	return mapPath(set, pathId, (p) => ({
		...p,
		edgeIds: p.edgeIds.includes(edgeId) ? p.edgeIds.filter((e) => e !== edgeId) : [...p.edgeIds, edgeId],
	}));
}

export function findPath(set: CanvasPathSet, id: string): CanvasPath | undefined {
	return set.paths.find((p) => p.id === id);
}

export function parsePathSet(raw: string, canvasPath: string): CanvasPathSet | null {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.paths)) return null;
	const paths: CanvasPath[] = [];
	for (const p of data.paths) {
		if (!isRecord(p) || typeof p.id !== "string" || typeof p.name !== "string") return null;
		if (!Array.isArray(p.edgeIds) || !p.edgeIds.every((e) => typeof e === "string")) return null;
		paths.push({ id: p.id, name: p.name, edgeIds: p.edgeIds as string[] });
	}
	return { version: 1, canvasPath, paths };
}

export function nodesOnPath(edges: Iterable<EdgeEnds>, edgeIds: ReadonlySet<string>): Set<string> {
	const nodes = new Set<string>();
	for (const edge of edges) {
		if (!edgeIds.has(edge.id)) continue;
		nodes.add(edge.fromNode);
		nodes.add(edge.toNode);
	}
	return nodes;
}

function mapPath(set: CanvasPathSet, id: string, fn: (p: CanvasPath) => CanvasPath): CanvasPathSet {
	if (!set.paths.some((p) => p.id === id)) return set;
	return { ...set, paths: set.paths.map((p) => (p.id === id ? fn(p) : p)) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
