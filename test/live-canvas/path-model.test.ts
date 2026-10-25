import { describe, expect, it } from "vitest";
import {
	addPath,
	checkPathName,
	deletePath,
	CORRUPT_KEY,
	emptyPathSet,
	nodesOnPath,
	parsePathSet,
	PATHS_KEY,
	pathSetPatch,
	readPathSet,
	renamePath,
	toggleEdge,
} from "../../src/live-canvas/path-model";

const base = () => addPath(addPath(emptyPathSet(), "p1", "Route A"), "p2", "Route B");

describe("checkPathName", () => {
	it("trims and accepts a new name", () => {
		expect(checkPathName(base(), "  Route C ")).toEqual({ ok: true, name: "Route C" });
	});

	it("rejects empty and whitespace-only names", () => {
		expect(checkPathName(base(), "   ")).toEqual({ ok: false, reason: "empty" });
	});

	it("rejects duplicates case-insensitively", () => {
		expect(checkPathName(base(), "route a")).toEqual({ ok: false, reason: "duplicate" });
	});

	it("allows keeping your own name on rename", () => {
		expect(checkPathName(base(), "Route A", "p1")).toEqual({ ok: true, name: "Route A" });
	});
});

describe("toggleEdge", () => {
	it("adds then removes an edge", () => {
		const on = toggleEdge(base(), "p1", "e1");
		expect(on.paths[0].edgeIds).toEqual(["e1"]);
		expect(toggleEdge(on, "p1", "e1").paths[0].edgeIds).toEqual([]);
	});

	it("lets two paths share an edge", () => {
		const s = toggleEdge(toggleEdge(base(), "p1", "e1"), "p2", "e1");
		expect(s.paths.map((p) => p.edgeIds)).toEqual([["e1"], ["e1"]]);
	});

	it("ignores an unknown path id and does not mutate input", () => {
		const s = base();
		expect(toggleEdge(s, "nope", "e1")).toEqual(s);
		toggleEdge(s, "p1", "e1");
		expect(s.paths[0].edgeIds).toEqual([]);
	});
});

describe("rename and delete", () => {
	it("renames by id", () => {
		expect(renamePath(base(), "p2", "Checkout").paths[1].name).toBe("Checkout");
	});

	it("deletes by id", () => {
		expect(deletePath(base(), "p1").paths.map((p) => p.id)).toEqual(["p2"]);
	});
});

describe("parsePathSet", () => {
	it("round-trips a valid set through JSON", () => {
		const s = toggleEdge(base(), "p1", "e1");
		expect(parsePathSet(JSON.parse(JSON.stringify(s)))).toEqual(s);
	});

	it("returns null for the wrong shape", () => {
		expect(parsePathSet("nope")).toBeNull();
		expect(parsePathSet({ version: 1, paths: [{ id: 1 }] })).toBeNull();
		expect(parsePathSet({ version: 2, paths: [] })).toBeNull();
	});
});

describe("readPathSet", () => {
	it("treats a missing key as no paths, not corrupt", () => {
		expect(readPathSet({ nodes: [], edges: [] })).toEqual({ set: emptyPathSet(), corrupt: false });
	});

	it("reads a valid set from canvas data", () => {
		const s = toggleEdge(base(), "p1", "e1");
		expect(readPathSet({ nodes: [], [PATHS_KEY]: s })).toEqual({ set: s, corrupt: false });
	});

	it("flags a corrupt value and returns an empty set", () => {
		expect(readPathSet({ [PATHS_KEY]: { version: 1, paths: "x" } })).toEqual({ set: emptyPathSet(), corrupt: true });
	});

	it("treats non-object canvas data as no paths", () => {
		expect(readPathSet(undefined)).toEqual({ set: emptyPathSet(), corrupt: false });
	});
});

describe("pathSetPatch", () => {
	it("touches only the plugin's key", () => {
		const data = { nodes: [{ id: "a" }], edges: [], other: 1 };
		expect(pathSetPatch(data, base())).toEqual({ [PATHS_KEY]: base() });
	});

	it("moves a corrupt value aside instead of destroying it", () => {
		const bad = { version: 1, paths: "x" };
		expect(pathSetPatch({ [PATHS_KEY]: bad }, base())).toEqual({ [PATHS_KEY]: base(), [CORRUPT_KEY]: bad });
	});
});

describe("nodesOnPath", () => {
	const edges = [
		{ id: "e1", fromNode: "start", toNode: "login" },
		{ id: "e2", fromNode: "login", toNode: "dash" },
		{ id: "e3", fromNode: "login", toNode: "checkout" },
	];

	it("collects both ends of on-path edges", () => {
		expect(nodesOnPath(edges, new Set(["e1", "e2"]))).toEqual(new Set(["start", "login", "dash"]));
	});

	it("ignores path edge ids that no longer exist", () => {
		expect(nodesOnPath(edges, new Set(["e1", "deleted"]))).toEqual(new Set(["start", "login"]));
	});
});
