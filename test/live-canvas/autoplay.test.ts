import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autoplay, Clock } from "../../src/live-canvas/autoplay";
import { isConsumedKey, keyAction, shouldHandleKey } from "../../src/live-canvas/presentation-keys";
import { PathApi, PresentationSession, SessionCanvas } from "../../src/live-canvas/presentation-session";
import { addSlide, emptyDeck, setSlideDuration, SlideDeck } from "../../src/live-canvas/slide-model";

const timerClock: Clock = {
	set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
	clear: (id) => clearTimeout(id),
};

const key = (k: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean }> = {}) => ({
	key: k,
	altKey: false,
	ctrlKey: false,
	metaKey: false,
	...mods,
});

describe("keyAction", () => {
	it("maps every presentation key", () => {
		const table: Array<[string, string]> = [
			["ArrowRight", "next"],
			[" ", "next"],
			["PageDown", "next"],
			["ArrowLeft", "prev"],
			["PageUp", "prev"],
			["Home", "first"],
			["End", "last"],
			["p", "toggle-play"],
			["P", "toggle-play"],
			["Escape", "exit"],
		];
		for (const [k, action] of table) expect(keyAction(key(k))).toBe(action);
	});

	it("ignores modified and unmapped keys", () => {
		expect(keyAction(key("ArrowRight", { metaKey: true }))).toBeNull();
		expect(keyAction(key("p", { ctrlKey: true }))).toBeNull();
		expect(keyAction(key("Home", { altKey: true }))).toBeNull();
		expect(keyAction(key("a"))).toBeNull();
		expect(keyAction(key("ArrowUp"))).toBeNull();
	});

	it("consumes keys that would edit or pan the canvas even when unmapped", () => {
		for (const k of ["ArrowUp", "ArrowDown", "Delete", "Backspace", " ", "ArrowRight"]) expect(isConsumedKey(key(k))).toBe(true);
		expect(isConsumedKey(key("a"))).toBe(false);
		expect(isConsumedKey(key("ArrowUp", { metaKey: true }))).toBe(false);
	});
});

describe("shouldHandleKey", () => {
	const ctx = (over: Partial<Parameters<typeof shouldHandleKey>[0]> = {}) => ({
		inModal: false,
		editable: false,
		insideCanvas: false,
		onBody: false,
		viewActive: false,
		...over,
	});

	it("handles keys aimed at the presenting canvas", () => {
		expect(shouldHandleKey(ctx({ insideCanvas: true }))).toBe(true);
		expect(shouldHandleKey(ctx({ onBody: true, viewActive: true }))).toBe(true);
	});

	it("leaves modals, text fields, and other panes alone", () => {
		expect(shouldHandleKey(ctx({ insideCanvas: true, inModal: true }))).toBe(false);
		expect(shouldHandleKey(ctx({ onBody: true, viewActive: true, inModal: true }))).toBe(false);
		expect(shouldHandleKey(ctx({ editable: true }))).toBe(false);
		expect(shouldHandleKey(ctx({ insideCanvas: true, editable: true }))).toBe(false);
		expect(shouldHandleKey(ctx({ onBody: true, viewActive: false }))).toBe(false);
		expect(shouldHandleKey(ctx())).toBe(false);
	});
});

describe("Autoplay", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("fires after the slide's duration and stops cleanly", () => {
		const onAdvance = vi.fn();
		const auto = new Autoplay(timerClock, (i) => (i + 1) * 1000, onAdvance);
		auto.start(1);
		expect(auto.playing).toBe(true);
		vi.advanceTimersByTime(1999);
		expect(onAdvance).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onAdvance).toHaveBeenCalledTimes(1);
		auto.start(0);
		auto.stop();
		expect(auto.playing).toBe(false);
		vi.advanceTimersByTime(10_000);
		expect(onAdvance).toHaveBeenCalledTimes(1);
	});
});

function deck3(): SlideDeck {
	let d = emptyDeck();
	d = addSlide(d, "a", "A", { minX: 0, minY: 0, maxX: 10, maxY: 10 });
	d = addSlide(d, "b", "B", { minX: 100, minY: 0, maxX: 110, maxY: 10 });
	d = addSlide(d, "c", "C", { minX: 200, minY: 0, maxX: 210, maxY: 10 });
	d = setSlideDuration(d, "a", 5);
	return setSlideDuration(d, "c", 2); // "b" uses the 10s default
}

function harness() {
	const viewports: Array<{ x: number }> = [];
	const canvas: SessionCanvas = {
		getScreenSize: () => ({ width: 1000, height: 1000 }),
		setViewport: (v) => viewports.push(v),
		deselectAll: () => undefined,
	};
	const paths: PathApi = { setActivePath: vi.fn(), stopEditing: vi.fn(), hasPath: () => true };
	const session = new PresentationSession(canvas, deck3(), paths, timerClock, () => undefined);
	return { session, viewports };
}

describe("PresentationSession auto-play", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("uses each slide's duration, falls back to 10s, and wraps", () => {
		const { session } = harness();
		session.begin(0, true);
		vi.advanceTimersByTime(4999);
		expect(session.index).toBe(0);
		vi.advanceTimersByTime(1);
		expect(session.index).toBe(1);
		vi.advanceTimersByTime(9999);
		expect(session.index).toBe(1);
		vi.advanceTimersByTime(1);
		expect(session.index).toBe(2);
		vi.advanceTimersByTime(2000);
		expect(session.index).toBe(0);
		expect(session.playing).toBe(true);
	});

	it("manual navigation stops auto-play", () => {
		const { session } = harness();
		session.begin(0, true);
		vi.advanceTimersByTime(1000);
		session.act("next");
		expect(session.index).toBe(1);
		expect(session.playing).toBe(false);
		vi.advanceTimersByTime(60_000);
		expect(session.index).toBe(1);
	});

	it("toggle-play resumes from the current slide with its full duration", () => {
		const { session } = harness();
		session.begin(2, false);
		session.act("toggle-play");
		expect(session.playing).toBe(true);
		vi.advanceTimersByTime(1999);
		expect(session.index).toBe(2);
		vi.advanceTimersByTime(1);
		expect(session.index).toBe(0);
		session.act("toggle-play");
		expect(session.playing).toBe(false);
	});

	it("manual next stays on the last slide and prev stays on the first", () => {
		const { session } = harness();
		session.begin(0, false);
		session.act("prev");
		expect(session.index).toBe(0);
		session.act("last");
		session.act("next");
		expect(session.index).toBe(2);
		session.act("first");
		expect(session.index).toBe(0);
	});

	it("stops the timer on exit", () => {
		const { session } = harness();
		session.begin(0, true);
		session.act("exit");
		expect(session.ended).toBe(true);
		expect(session.playing).toBe(false);
		vi.advanceTimersByTime(60_000);
		expect(session.index).toBe(0);
	});
});
