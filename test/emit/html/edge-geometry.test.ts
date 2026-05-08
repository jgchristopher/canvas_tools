import { describe, expect, it } from "vitest";
import { anchorPoint, bezierPath } from "../../../src/emit/html/edge-geometry";

describe("anchorPoint", () => {
	const node = { x: 10, y: 20, w: 100, h: 80 };
	const bounds = { x: 0, y: 0, w: 200, h: 200 };

	it("places the right anchor at the right-middle of the node, in canvas coords", () => {
		expect(anchorPoint(node, "right", bounds)).toEqual({ x: 110, y: 60 });
	});

	it("places the top anchor at the top-middle", () => {
		expect(anchorPoint(node, "top", bounds)).toEqual({ x: 60, y: 20 });
	});

	it("subtracts the bounds offset", () => {
		expect(anchorPoint(node, "left", { x: 5, y: 10, w: 200, h: 200 })).toEqual({ x: 5, y: 50 });
	});
});

describe("bezierPath", () => {
	it("emits a cubic bezier with control points offset perpendicular to each side", () => {
		const a = { x: 0, y: 100 };
		const b = { x: 400, y: 100 };
		const path = bezierPath(a, "right", b, "left");
		expect(path.d).toMatch(/^M 0 100 C \d+(\.\d+)? 100, \d+(\.\d+)? 100, 400 100$/);
	});

	it("computes a midpoint that is between the endpoints", () => {
		const a = { x: 0, y: 0 };
		const b = { x: 200, y: 200 };
		const path = bezierPath(a, "right", b, "left");
		expect(path.midX).toBeGreaterThan(0);
		expect(path.midX).toBeLessThan(200);
		expect(path.midY).toBeGreaterThan(0);
		expect(path.midY).toBeLessThan(200);
	});

	it("offsets control points outward from the side direction", () => {
		const a = { x: 0, y: 0 };
		const b = { x: 0, y: 100 };
		const path = bezierPath(a, "bottom", b, "top");
		// bottom-side control point sits below a; top-side control point sits above b
		expect(path.d).toMatch(/M 0 0 C 0 \d+(\.\d+)?, 0 -?\d+(\.\d+)?, 0 100/);
	});
});
