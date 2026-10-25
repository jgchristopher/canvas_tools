import { describe, expect, it } from "vitest";
import { fitRect, viewportToRect } from "../../src/live-canvas/viewport-fit";

const LIMITS = { min: -4, max: 1 };
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

describe("viewportToRect", () => {
	it("matches Obsidian's getViewportBBox for a probed viewport", () => {
		// Probed live: center 5263.25,1119.36, zoom -0.0927 on 1634x931.
		const rect = viewportToRect({ x: 5263.254332678404, y: 1119.3594592068425, zoom: -0.09268876038136448 }, { width: 1634, height: 931 });
		expect(rect.minX).toBeCloseTo(4392.04172094852, 6);
		expect(rect.maxY).toBeCloseTo(1615.7480403087532, 6);
	});
});

describe("fitRect", () => {
	it("round-trips a captured viewport on the same screen, including above 100%", () => {
		for (const zoom of [-2, 0, 0.5, 1]) {
			const v = { x: 120, y: -40, zoom };
			const back = fitRect(viewportToRect(v, DESKTOP), DESKTOP, LIMITS);
			expect(back.x).toBeCloseTo(v.x, 9);
			expect(back.y).toBeCloseTo(v.y, 9);
			expect(back.zoom).toBeCloseTo(zoom, 9);
		}
	});

	it("centers a desktop capture on a phone and keeps it fully visible", () => {
		const rect = viewportToRect({ x: 0, y: 0, zoom: 0 }, DESKTOP);
		const v = fitRect(rect, PHONE, LIMITS);
		const shown = viewportToRect(v, PHONE);
		expect(v.x).toBeCloseTo(0, 9);
		expect(v.y).toBeCloseTo(0, 9);
		expect(shown.minX).toBeLessThanOrEqual(rect.minX + 1e-9);
		expect(shown.maxX).toBeGreaterThanOrEqual(rect.maxX - 1e-9);
		expect(shown.minY).toBeLessThanOrEqual(rect.minY + 1e-9);
		expect(shown.maxY).toBeGreaterThanOrEqual(rect.maxY - 1e-9);
	});

	it("clamps to the zoom limits", () => {
		expect(fitRect({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, DESKTOP, LIMITS).zoom).toBe(1);
		expect(fitRect({ minX: 0, minY: 0, maxX: 1e7, maxY: 1e7 }, DESKTOP, LIMITS).zoom).toBe(-4);
	});

	it("returns a finite viewport for a zero-size screen or rect", () => {
		const zeroScreen = fitRect({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 0, height: 0 }, LIMITS);
		const zeroRect = fitRect({ minX: 5, minY: 5, maxX: 5, maxY: 5 }, DESKTOP, LIMITS);
		for (const v of [zeroScreen, zeroRect]) {
			expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom)).toBe(true);
		}
	});
});
