import { describe, expect, it } from "vitest";
import { addPath, emptyPathSet, toggleEdge } from "../../src/live-canvas/path-model";
import { PathFileAdapter, PathStore, pathFileKey } from "../../src/live-canvas/path-store";

const DIR = ".obsidian/plugins/canvas-tools/paths";

function memAdapter(): PathFileAdapter & { files: Map<string, string>; dirs: string[] } {
	const files = new Map<string, string>();
	const dirs: string[] = [];
	return {
		files,
		dirs,
		exists: async (p) => files.has(p) || dirs.includes(p),
		read: async (p) => {
			const v = files.get(p);
			if (v === undefined) throw new Error(`ENOENT ${p}`);
			return v;
		},
		write: async (p, data) => {
			files.set(p, data);
		},
		remove: async (p) => {
			files.delete(p);
		},
		rename: async (from, to) => {
			const v = files.get(from);
			if (v === undefined) throw new Error(`ENOENT ${from}`);
			files.delete(from);
			files.set(to, v);
		},
		mkdir: async (p) => {
			dirs.push(p);
		},
	};
}

describe("pathFileKey", () => {
	it("is stable and readable", () => {
		expect(pathFileKey("Maps/User Flow.canvas")).toBe(pathFileKey("Maps/User Flow.canvas"));
		expect(pathFileKey("Maps/User Flow.canvas")).toMatch(/^user-flow-[0-9a-f]{8}$/);
	});

	it("differs for the same name in different folders", () => {
		expect(pathFileKey("a/flow.canvas")).not.toBe(pathFileKey("b/flow.canvas"));
	});
});

describe("PathStore", () => {
	it("loads an empty set when no file exists", async () => {
		const { set, corrupt } = await new PathStore(memAdapter(), DIR).load("flow.canvas");
		expect(set).toEqual(emptyPathSet("flow.canvas"));
		expect(corrupt).toBe(false);
	});

	it("persists an update and creates the dir", async () => {
		const fs = memAdapter();
		const store = new PathStore(fs, DIR);
		await store.update("flow.canvas", (s) => addPath(s, "p1", "Route A"));
		expect(fs.dirs).toContain(DIR);
		expect((await store.load("flow.canvas")).set.paths[0].name).toBe("Route A");
	});

	it("re-reads before writing, keeping another machine's change", async () => {
		const fs = memAdapter();
		const mine = new PathStore(fs, DIR);
		const theirs = new PathStore(fs, DIR);
		await mine.update("flow.canvas", (s) => addPath(s, "p1", "Route A"));
		await theirs.update("flow.canvas", (s) => addPath(s, "p2", "Route B"));
		await mine.update("flow.canvas", (s) => toggleEdge(s, "p1", "e1"));
		const { set } = await mine.load("flow.canvas");
		expect(set.paths.map((p) => p.name)).toEqual(["Route A", "Route B"]);
		expect(set.paths[0].edgeIds).toEqual(["e1"]);
	});

	it("keeps canvases in separate files", async () => {
		const fs = memAdapter();
		const store = new PathStore(fs, DIR);
		await store.update("x.canvas", (s) => addPath(s, "p1", "X"));
		await store.update("y.canvas", (s) => addPath(s, "p1", "Y"));
		expect([...fs.files.keys()].filter((k) => k.startsWith(DIR))).toHaveLength(2);
	});

	it("flags a corrupt file and moves it aside on first write", async () => {
		const fs = memAdapter();
		fs.files.set(`${DIR}/${pathFileKey("flow.canvas")}.json`, "{oops");
		const store = new PathStore(fs, DIR);
		expect((await store.load("flow.canvas")).corrupt).toBe(true);
		await store.update("flow.canvas", (s) => addPath(s, "p1", "Route A"));
		expect([...fs.files.keys()].some((k) => k.includes(".corrupt-"))).toBe(true);
		expect((await store.load("flow.canvas")).corrupt).toBe(false);
	});

	it("follows a rename, and later edits land in the new file", async () => {
		const fs = memAdapter();
		const store = new PathStore(fs, DIR);
		await store.update("old.canvas", (s) => addPath(s, "p1", "Route A"));
		await store.renameCanvas("old.canvas", "new.canvas");
		await store.update("new.canvas", (s) => toggleEdge(s, "p1", "e1"));
		const { set } = await store.load("new.canvas");
		expect(set.canvasPath).toBe("new.canvas");
		expect(set.paths[0].edgeIds).toEqual(["e1"]);
		expect((await store.load("old.canvas")).set.paths).toEqual([]);
	});

	it("keeps a corrupt file's bytes when its canvas is renamed", async () => {
		const fs = memAdapter();
		fs.files.set(`${DIR}/${pathFileKey("old.canvas")}.json`, "{oops");
		const store = new PathStore(fs, DIR);
		await store.renameCanvas("old.canvas", "new.canvas");
		expect([...fs.files.values()]).toContain("{oops");
		expect((await store.load("new.canvas")).corrupt).toBe(true);
	});

	it("ignores a rename for a canvas with no paths", async () => {
		const fs = memAdapter();
		await new PathStore(fs, DIR).renameCanvas("none.canvas", "other.canvas");
		expect(fs.files.size).toBe(0);
	});

	it("deletes a canvas's file", async () => {
		const fs = memAdapter();
		const store = new PathStore(fs, DIR);
		await store.update("flow.canvas", (s) => addPath(s, "p1", "Route A"));
		await store.deleteCanvas("flow.canvas");
		expect((await store.load("flow.canvas")).set.paths).toEqual([]);
	});
});
