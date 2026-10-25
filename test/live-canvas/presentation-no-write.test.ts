import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Clock } from "../../src/live-canvas/autoplay";
import { getLiveCanvas } from "../../src/live-canvas/canvas-internals";
import { PathApi, PresentationSession } from "../../src/live-canvas/presentation-session";
import { addSlide, emptyDeck, setSlidePath } from "../../src/live-canvas/slide-model";

// A fake Obsidian canvas, shaped per the spike doc, that records saves.
function fakeView() {
	const el = () => ({ contains: () => false });
	const data = { nodes: [{ id: "n1" }], edges: [], canvasToolsSlides: { version: 1, slides: [] } };
	const canvas = {
		edges: new Map(),
		nodes: new Map(),
		wrapperEl: el(),
		canvasEl: el(),
		canvasControlsEl: el(),
		data,
		readonly: false,
		saveCalls: 0,
		setDataCalls: 0,
		requestSave() {
			this.saveCalls++;
		},
		setData() {
			this.setDataCalls++;
		},
		canvasRect: { width: 1600, height: 900 },
		x: 0,
		y: 0,
		zoom: 0,
		tx: 0,
		ty: 0,
		tZoom: 0,
		zoomCenter: null,
		getViewportBBox: () => ({ minX: -800, minY: -450, maxX: 800, maxY: 450 }),
		markViewportChanged: () => undefined,
		deselectAll: () => undefined,
	};
	return { canvas };
}

const clock: Clock = {
	set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
	clear: (id) => clearTimeout(id),
};

describe("presentation session never writes", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("runs a full session with zero saves and unchanged data", () => {
		const view = fakeView();
		const before = JSON.parse(JSON.stringify(view.canvas.data));
		const live = getLiveCanvas(view)!;
		expect(live).not.toBeNull();

		let deck = emptyDeck();
		deck = addSlide(deck, "a", "A", { minX: 0, minY: 0, maxX: 100, maxY: 100 });
		deck = addSlide(deck, "b", "B", { minX: 200, minY: 0, maxX: 300, maxY: 100 });
		deck = addSlide(deck, "c", "C", { minX: 400, minY: 0, maxX: 500, maxY: 100 });
		deck = setSlidePath(deck, "a", "path-real");
		deck = setSlidePath(deck, "b", "path-gone");

		const paths: PathApi & { calls: Array<string | null> } = {
			calls: [],
			setActivePath(id) {
				this.calls.push(id);
			},
			stopEditing: vi.fn(),
			hasPath: (id) => id === "path-real",
		};

		const session = new PresentationSession(live, deck, paths, clock, () => undefined);
		session.begin(0, true);
		session.act("next");
		session.act("prev");
		session.act("last");
		session.act("first");
		session.act("toggle-play");
		vi.advanceTimersByTime(5 * 10_000);
		session.refit();
		session.act("exit");

		expect(view.canvas.saveCalls).toBe(0);
		expect(view.canvas.setDataCalls).toBe(0);
		expect(view.canvas.data).toEqual(before);
		expect(paths.stopEditing).toHaveBeenCalledTimes(1);
		// a has a real path, b points at a deleted one, c has none; exit clears.
		// begin(a), next(b), prev(a), last(c), first(a), then 5 auto-play ticks
		// of 10s each: b, c, a, b, c.
		expect(paths.calls).toEqual(["path-real", null, "path-real", null, "path-real", null, null, "path-real", null, null, null]);
	});

	it("skips viewport changes while the canvas has no size", () => {
		const view = fakeView();
		view.canvas.canvasRect = { width: 0, height: 0 };
		const live = getLiveCanvas(view)!;
		const deck = addSlide(emptyDeck(), "a", "A", { minX: 0, minY: 0, maxX: 100, maxY: 100 });
		const paths: PathApi = { setActivePath: () => undefined, stopEditing: () => undefined, hasPath: () => false };
		new PresentationSession(live, deck, paths, clock, () => undefined).begin(0, false);
		expect([view.canvas.tx, view.canvas.ty, view.canvas.tZoom]).toEqual([0, 0, 0]);
	});
});
