import { describe, expect, it } from "vitest";
import {
	addSlide,
	deckPatch,
	DEFAULT_DURATION_SEC,
	isValidRect,
	deleteSlide,
	emptyDeck,
	moveSlide,
	nextSlideName,
	parseDeck,
	readDeck,
	renameSlide,
	setSlideDuration,
	setSlidePath,
	SLIDES_CORRUPT_KEY,
	SLIDES_KEY,
	slideDuration,
	updateSlideRect,
} from "../../src/live-canvas/slide-model";

const r = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX, minY, maxX, maxY });
const three = () =>
	addSlide(addSlide(addSlide(emptyDeck(), "s1", "Intro", r(0, 0, 100, 50)), "s2", "Flow", r(100, 0, 300, 100)), "s3", "End", r(0, 0, 10, 10));
const ids = (d: ReturnType<typeof emptyDeck>) => d.slides.map((s) => s.id);

describe("nextSlideName", () => {
	it("numbers from the slide count", () => {
		expect(nextSlideName(emptyDeck())).toBe("Slide 1");
		expect(nextSlideName(three())).toBe("Slide 4");
	});

	it("skips names already in use", () => {
		const d = addSlide(emptyDeck(), "a", "Slide 2", r(0, 0, 1, 1));
		expect(nextSlideName(d)).toBe("Slide 3");
	});
});

describe("slide transforms", () => {
	it("adds slides in order with only the given fields", () => {
		const d = three();
		expect(ids(d)).toEqual(["s1", "s2", "s3"]);
		expect(d.slides[0]).toEqual({ id: "s1", name: "Intro", rect: r(0, 0, 100, 50) });
	});

	it("adds a slide with the path highlighted at capture time", () => {
		const d = addSlide(emptyDeck(), "s9", "Lit", r(0, 0, 1, 1), "path-a");
		expect(d.slides[0]).toEqual({ id: "s9", name: "Lit", rect: r(0, 0, 1, 1), pathId: "path-a" });
		expect("pathId" in addSlide(emptyDeck(), "s8", "Plain", r(0, 0, 1, 1), null).slides[0]).toBe(false);
	});

	it("updates a slide's rect", () => {
		expect(updateSlideRect(three(), "s2", r(1, 2, 3, 4)).slides[1].rect).toEqual(r(1, 2, 3, 4));
	});

	it("renames with trimming", () => {
		expect(renameSlide(three(), "s1", "  Opening ").slides[0].name).toBe("Opening");
	});

	it("moves up and down, and is a no-op at the ends", () => {
		expect(ids(moveSlide(three(), "s2", -1))).toEqual(["s2", "s1", "s3"]);
		expect(ids(moveSlide(three(), "s2", 1))).toEqual(["s1", "s3", "s2"]);
		expect(ids(moveSlide(three(), "s1", -1))).toEqual(["s1", "s2", "s3"]);
		expect(ids(moveSlide(three(), "s3", 1))).toEqual(["s1", "s2", "s3"]);
	});

	it("deletes by id", () => {
		expect(ids(deleteSlide(three(), "s2"))).toEqual(["s1", "s3"]);
	});

	it("sets and clears a path, removing the key when cleared", () => {
		const on = setSlidePath(three(), "s1", "path-a");
		expect(on.slides[0].pathId).toBe("path-a");
		expect("pathId" in setSlidePath(on, "s1", null).slides[0]).toBe(false);
	});

	it("sets and clears a duration, removing the key when cleared", () => {
		const on = setSlideDuration(three(), "s1", 5);
		expect(on.slides[0].durationSec).toBe(5);
		expect("durationSec" in setSlideDuration(on, "s1", null).slides[0]).toBe(false);
	});

	it("ignores invalid durations", () => {
		for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(setSlideDuration(three(), "s1", bad)).toEqual(three());
		}
	});

	it("ignores unknown ids and never mutates input", () => {
		const d = three();
		expect(renameSlide(d, "nope", "x")).toEqual(d);
		expect(moveSlide(d, "nope", 1)).toEqual(d);
		renameSlide(d, "s1", "Changed");
		expect(d.slides[0].name).toBe("Intro");
	});
});

describe("slideDuration", () => {
	it("falls back to the default", () => {
		expect(slideDuration(three().slides[0])).toBe(DEFAULT_DURATION_SEC);
		expect(DEFAULT_DURATION_SEC).toBe(10);
		expect(slideDuration(setSlideDuration(three(), "s1", 3).slides[0])).toBe(3);
	});
});

describe("parseDeck", () => {
	it("round-trips a full deck through JSON", () => {
		const d = setSlideDuration(setSlidePath(three(), "s2", "p"), "s3", 4);
		expect(parseDeck(JSON.parse(JSON.stringify(d)))).toEqual(d);
	});

	it("rejects bad shapes", () => {
		const slide = (over: Record<string, unknown>) => ({ version: 1, slides: [{ id: "a", name: "A", rect: r(0, 0, 1, 1), ...over }] });
		expect(parseDeck(null)).toBeNull();
		expect(parseDeck({ version: 2, slides: [] })).toBeNull();
		expect(parseDeck(slide({ rect: r(5, 0, 1, 1) }))).toBeNull(); // inverted
		expect(parseDeck(slide({ rect: r(0, 0, 0, 1) }))).toBeNull(); // zero width
		expect(parseDeck(slide({ rect: { minX: 0, minY: 0, maxX: "1", maxY: 1 } }))).toBeNull();
		expect(parseDeck(slide({ pathId: 3 }))).toBeNull();
		expect(parseDeck(slide({ durationSec: 0 }))).toBeNull();
		expect(parseDeck(slide({ name: 7 }))).toBeNull();
	});
});

describe("readDeck and deckPatch", () => {
	it("treats a missing key as an empty deck", () => {
		expect(readDeck({ nodes: [], edges: [] })).toEqual({ deck: emptyDeck(), corrupt: false });
	});

	it("reads a valid deck", () => {
		expect(readDeck({ [SLIDES_KEY]: three() })).toEqual({ deck: three(), corrupt: false });
	});

	it("flags a corrupt value", () => {
		expect(readDeck({ [SLIDES_KEY]: { version: 1, slides: "x" } })).toEqual({ deck: emptyDeck(), corrupt: true });
	});

	it("patches only the slides key", () => {
		expect(deckPatch({ nodes: [{ id: "a" }], edges: [], canvasToolsPaths: {} }, three())).toEqual({ [SLIDES_KEY]: three() });
	});

	it("moves a corrupt value aside", () => {
		const bad = { version: 1, slides: "x" };
		expect(deckPatch({ [SLIDES_KEY]: bad }, three())).toEqual({ [SLIDES_KEY]: three(), [SLIDES_CORRUPT_KEY]: bad });
	});
});

describe("isValidRect", () => {
	it("accepts a positive-area finite rect", () => {
		expect(isValidRect(r(0, 0, 1, 1))).toBe(true);
	});

	it("rejects zero-area, inverted, and non-finite rects", () => {
		expect(isValidRect(r(0, 0, 0, 0))).toBe(false);
		expect(isValidRect(r(5, 0, 1, 1))).toBe(false);
		expect(isValidRect(r(0, 0, Number.NaN, 1))).toBe(false);
	});
});
