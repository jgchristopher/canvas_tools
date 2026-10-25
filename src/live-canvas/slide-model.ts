import { isRecord, keyedPatch, readKeyed } from "./canvas-data";

// Slides live in the .canvas file under this top-level key, next to paths.
export const SLIDES_KEY = "canvasToolsSlides";
export const SLIDES_CORRUPT_KEY = "canvasToolsSlidesCorrupt";
export const DEFAULT_DURATION_SEC = 10;

export interface Rect {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export interface Slide {
	id: string;
	name: string;
	rect: Rect;
	pathId?: string;
	durationSec?: number;
}

export interface SlideDeck {
	version: 1;
	slides: Slide[];
}

export function emptyDeck(): SlideDeck {
	return { version: 1, slides: [] };
}

export function nextSlideName(deck: SlideDeck): string {
	const taken = new Set(deck.slides.map((s) => s.name));
	let n = deck.slides.length + 1;
	while (taken.has(`Slide ${n}`)) n++;
	return `Slide ${n}`;
}

export function addSlide(deck: SlideDeck, id: string, name: string, rect: Rect, pathId: string | null = null): SlideDeck {
	const slide = withOptional({ id, name: name.trim(), rect: { ...rect } }, "pathId", pathId ?? undefined);
	return { ...deck, slides: [...deck.slides, slide] };
}

export function updateSlideRect(deck: SlideDeck, id: string, rect: Rect): SlideDeck {
	return mapSlide(deck, id, (s) => ({ ...s, rect: { ...rect } }));
}

export function renameSlide(deck: SlideDeck, id: string, name: string): SlideDeck {
	return mapSlide(deck, id, (s) => ({ ...s, name: name.trim() }));
}

export function moveSlide(deck: SlideDeck, id: string, delta: -1 | 1): SlideDeck {
	const from = deck.slides.findIndex((s) => s.id === id);
	const to = from + delta;
	if (from < 0 || to < 0 || to >= deck.slides.length) return deck;
	const slides = [...deck.slides];
	const [moved] = slides.splice(from, 1);
	if (moved) slides.splice(to, 0, moved);
	return { ...deck, slides };
}

export function deleteSlide(deck: SlideDeck, id: string): SlideDeck {
	return { ...deck, slides: deck.slides.filter((s) => s.id !== id) };
}

// Optional fields are stored only when set, so a cleared field leaves no key
// behind in the .canvas file.
export function setSlidePath(deck: SlideDeck, id: string, pathId: string | null): SlideDeck {
	return mapSlide(deck, id, (s) => withOptional(s, "pathId", pathId ?? undefined));
}

export function setSlideDuration(deck: SlideDeck, id: string, sec: number | null): SlideDeck {
	if (sec !== null && !isValidDuration(sec)) return deck;
	return mapSlide(deck, id, (s) => withOptional(s, "durationSec", sec ?? undefined));
}

export function slideDuration(slide: Slide): number {
	return slide.durationSec ?? DEFAULT_DURATION_SEC;
}

export function parseDeck(value: unknown): SlideDeck | null {
	if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.slides)) return null;
	const slides: Slide[] = [];
	for (const s of value.slides) {
		if (!isRecord(s) || typeof s.id !== "string" || typeof s.name !== "string") return null;
		const rect = parseRect(s.rect);
		if (!rect) return null;
		const slide: Slide = { id: s.id, name: s.name, rect };
		if (s.pathId !== undefined) {
			if (typeof s.pathId !== "string") return null;
			slide.pathId = s.pathId;
		}
		if (s.durationSec !== undefined) {
			if (typeof s.durationSec !== "number" || !isValidDuration(s.durationSec)) return null;
			slide.durationSec = s.durationSec;
		}
		slides.push(slide);
	}
	return { version: 1, slides };
}

export function readDeck(canvasData: unknown): { deck: SlideDeck; corrupt: boolean } {
	const { value, corrupt } = readKeyed(canvasData, SLIDES_KEY, parseDeck, emptyDeck);
	return { deck: value, corrupt };
}

export function deckPatch(canvasData: unknown, deck: SlideDeck): Record<string, unknown> {
	return keyedPatch(canvasData, SLIDES_KEY, SLIDES_CORRUPT_KEY, parseDeck, deck);
}

function parseRect(value: unknown): Rect | null {
	if (!isRecord(value)) return null;
	const { minX, minY, maxX, maxY } = value;
	const nums = [minX, minY, maxX, maxY];
	if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
	const rect = { minX, minY, maxX, maxY } as Rect;
	return isValidRect(rect) ? rect : null;
}

// parseDeck rejects a whole deck containing an invalid rect, so callers check
// a captured rect before writing it.
export function isValidRect(rect: Rect): boolean {
	const nums = [rect.minX, rect.minY, rect.maxX, rect.maxY];
	return nums.every((n) => Number.isFinite(n)) && rect.maxX > rect.minX && rect.maxY > rect.minY;
}

function isValidDuration(sec: number): boolean {
	return Number.isFinite(sec) && sec > 0;
}

function withOptional<K extends "pathId" | "durationSec">(slide: Slide, key: K, value: Slide[K] | undefined): Slide {
	const next = { ...slide };
	if (value === undefined) delete next[key];
	else next[key] = value;
	return next;
}

function mapSlide(deck: SlideDeck, id: string, fn: (s: Slide) => Slide): SlideDeck {
	if (!deck.slides.some((s) => s.id === id)) return deck;
	return { ...deck, slides: deck.slides.map((s) => (s.id === id ? fn(s) : s)) };
}
