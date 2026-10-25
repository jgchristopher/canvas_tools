import { describe, expect, it } from "vitest";
import {
	addPath,
	checkPathName,
	deletePath,
	emptyPathSet,
	nodesOnPath,
	parsePathSet,
	renamePath,
	toggleEdge,
} from "../../src/live-canvas/path-model";

const base = () => addPath(addPath(emptyPathSet("Maps/flow.canvas"), "p1", "Route A"), "p2", "Route B");

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
	it("round-trips a valid set", () => {
		const s = toggleEdge(base(), "p1", "e1");
		expect(parsePathSet(JSON.stringify(s), "Maps/flow.canvas")).toEqual(s);
	});

	it("uses the given canvas path over the stored one", () => {
		const s = { ...base(), canvasPath: "old.canvas" };
		expect(parsePathSet(JSON.stringify(s), "new.canvas")?.canvasPath).toBe("new.canvas");
	});

	it("returns null for invalid JSON or the wrong shape", () => {
		expect(parsePathSet("{not json", "a.canvas")).toBeNull();
		expect(parsePathSet(JSON.stringify({ paths: [{ id: 1 }] }), "a.canvas")).toBeNull();
		expect(parsePathSet(JSON.stringify({ version: 2, paths: [] }), "a.canvas")).toBeNull();
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
