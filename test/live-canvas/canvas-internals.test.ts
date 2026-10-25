import { describe, expect, it } from "vitest";
import { getLiveCanvas } from "../../src/live-canvas/canvas-internals";

// Shapes follow docs/superpowers/spikes/2026-10-24-canvas-internals.md.
interface FakeEl {
	children: FakeEl[];
	contains(other: unknown): boolean;
}

function fakeEl(...children: FakeEl[]): FakeEl {
	const el: FakeEl = {
		children,
		contains(other) {
			return other === el || el.children.some((c) => c.contains(other));
		},
	};
	return el;
}

function fakeEdge(id: string, from: string, to: string, label = false) {
	return {
		id,
		from: { node: { id: from }, side: "right", end: "none" },
		to: { node: { id: to }, side: "left", end: "arrow" },
		lineGroupEl: fakeEl(fakeEl(), fakeEl()),
		lineEndGroupEl: fakeEl(),
		labelElement: label ? { wrapperEl: fakeEl(fakeEl()) } : undefined,
	};
}

function fakeView() {
	return {
		canvas: {
			edges: new Map([["e1", fakeEdge("e1", "a", "b", true)]]),
			nodes: new Map([
				["a", { id: "a", nodeEl: fakeEl() }],
				["b", { id: "b", nodeEl: fakeEl() }],
			]),
			wrapperEl: fakeEl(),
			canvasEl: fakeEl(),
			canvasControlsEl: fakeEl(),
			data: { nodes: [], edges: [] } as Record<string, unknown>,
			readonly: false,
			saves: [] as boolean[],
			requestSave(pushHistory: boolean) {
				this.saves.push(pushHistory);
			},
		},
	};
}

function addFakeEdge(view: ReturnType<typeof fakeView>, id: string, from: string, to: string): void {
	view.canvas.edges.set(id, fakeEdge(id, from, to));
}

describe("getLiveCanvas", () => {
	it("returns null for things that are not canvas views", () => {
		expect(getLiveCanvas(null)).toBeNull();
		expect(getLiveCanvas({})).toBeNull();
		expect(getLiveCanvas({ canvas: {} })).toBeNull();
		expect(getLiveCanvas({ canvas: { ...fakeView().canvas, edges: [] } })).toBeNull();
		expect(getLiveCanvas({ canvas: { ...fakeView().canvas, canvasEl: undefined } })).toBeNull();
	});

	it("maps edges to ids, end node ids, and elements", () => {
		const live = getLiveCanvas(fakeView())!;
		expect(live.edges().map(({ id, fromNode, toNode }) => ({ id, fromNode, toNode }))).toEqual([
			{ id: "e1", fromNode: "a", toNode: "b" },
		]);
		expect(live.edges()[0].els).toHaveLength(3); // line group, line-end group, label
	});

	it("maps nodes to ids and root elements", () => {
		const view = fakeView();
		const live = getLiveCanvas(view)!;
		expect(live.nodes().map((n) => n.id)).toEqual(["a", "b"]);
		expect(live.nodes()[0].el).toBe(view.canvas.nodes.get("a")!.nodeEl);
	});

	it("reads edges live, not from a snapshot", () => {
		const view = fakeView();
		const live = getLiveCanvas(view)!;
		addFakeEdge(view, "e2", "b", "a");
		expect(live.edges()).toHaveLength(2);
	});

	it("skips malformed edges instead of throwing", () => {
		const view = fakeView();
		(view.canvas.edges as Map<string, unknown>).set("bad", { id: "bad" });
		expect(getLiveCanvas(view)!.edges().map((e) => e.id)).toEqual(["e1"]);
	});

	it("finds the edge for one of its elements, and null otherwise", () => {
		const view = fakeView();
		const live = getLiveCanvas(view)!;
		const edge = view.canvas.edges.get("e1")!;
		expect(live.edgeFromTarget(edge.lineGroupEl.children[0])?.id).toBe("e1");
		expect(live.edgeFromTarget(edge.labelElement!.wrapperEl.children[0])?.id).toBe("e1");
		expect(live.edgeFromTarget(view.canvas.nodes.get("a")!.nodeEl)).toBeNull();
		expect(live.edgeFromTarget(null)).toBeNull();
	});

	it("exposes the wrapper, canvas, and controls elements", () => {
		const view = fakeView();
		const live = getLiveCanvas(view)!;
		expect(live.root).toBe(view.canvas.wrapperEl);
		expect(live.observeEl).toBe(view.canvas.canvasEl);
		expect(live.controlsEl).toBe(view.canvas.canvasControlsEl);
	});

	it("returns null when canvas data or save is missing", () => {
		expect(getLiveCanvas({ canvas: { ...fakeView().canvas, data: undefined } })).toBeNull();
		expect(getLiveCanvas({ canvas: { ...fakeView().canvas, requestSave: undefined } })).toBeNull();
	});

	it("reads canvas data live", () => {
		const view = fakeView();
		const live = getLiveCanvas(view)!;
		const next = { nodes: [], edges: [] };
		view.canvas.data = next;
		expect(live.readData()).toBe(next);
	});

	it("writes a patch onto canvas data and saves with an undo step", () => {
		const view = fakeView();
		getLiveCanvas(view)!.writeData({ canvasToolsPaths: { version: 1, paths: [] } });
		expect(view.canvas.data).toEqual({ nodes: [], edges: [], canvasToolsPaths: { version: 1, paths: [] } });
		expect(view.canvas.saves).toEqual([true]);
	});

	it("reports read-only state live", () => {
		const view = fakeView();
		const live = getLiveCanvas(view)!;
		expect(live.isReadonly()).toBe(false);
		view.canvas.readonly = true;
		expect(live.isReadonly()).toBe(true);
	});
});
