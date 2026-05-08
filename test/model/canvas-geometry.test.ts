import { describe, expect, it } from "vitest";
import {
	computeBounds,
	inferSide,
	normalizeEdge,
} from "../../src/model/canvas-geometry";
import type { CanvasNode, RawCanvasEdge, TextNode } from "../../src/model/canvas-types";

function textNode(id: string, x: number, y: number, w = 100, h = 100): TextNode {
	return { kind: "text", id, x, y, w, h, html: "", rawMarkdown: "" };
}

describe("computeBounds", () => {
	it("returns zero bounds for empty input", () => {
		expect(computeBounds([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
	});

	it("computes the bounding box across all nodes", () => {
		const nodes: CanvasNode[] = [textNode("a", 0, 0, 100, 100), textNode("b", 200, 100, 50, 50)];
		expect(computeBounds(nodes)).toEqual({ x: 0, y: 0, w: 250, h: 150 });
	});

	it("handles negative coordinates", () => {
		const nodes: CanvasNode[] = [textNode("a", -200, -100, 100, 100), textNode("b", 100, 100, 100, 100)];
		expect(computeBounds(nodes)).toEqual({ x: -200, y: -100, w: 400, h: 300 });
	});
});

describe("inferSide", () => {
	const left = textNode("L", 0, 100, 100, 100);
	const right = textNode("R", 400, 100, 100, 100);
	const above = textNode("U", 200, -200, 100, 100);
	const below = textNode("D", 200, 400, 100, 100);

	it("picks right when target is to the right", () => {
		expect(inferSide(left, right, "from")).toBe("right");
		expect(inferSide(right, left, "from")).toBe("left");
	});

	it("picks vertical when target is mostly above or below", () => {
		expect(inferSide(below, above, "from")).toBe("top");
		expect(inferSide(above, below, "from")).toBe("bottom");
	});

	it("falls back to a stable default when nodes are missing", () => {
		expect(inferSide(undefined, left, "from")).toBe("right");
		expect(inferSide(undefined, left, "to")).toBe("left");
	});
});

describe("normalizeEdge", () => {
	const a = textNode("a", 0, 0);
	const b = textNode("b", 400, 0);
	const nodes: CanvasNode[] = [a, b];

	it("preserves explicit sides", () => {
		const raw: RawCanvasEdge = { id: "e", fromNode: "a", toNode: "b", fromSide: "top", toSide: "bottom" };
		const edge = normalizeEdge(raw, nodes);
		expect(edge.from.side).toBe("top");
		expect(edge.to.side).toBe("bottom");
	});

	it("infers sides from geometry when missing", () => {
		const raw: RawCanvasEdge = { id: "e", fromNode: "a", toNode: "b" };
		const edge = normalizeEdge(raw, nodes);
		expect(edge.from.side).toBe("right");
		expect(edge.to.side).toBe("left");
	});

	it("defaults to a directional arrow with no fromEnd", () => {
		const raw: RawCanvasEdge = { id: "e", fromNode: "a", toNode: "b" };
		const edge = normalizeEdge(raw, nodes);
		expect(edge.toEnd).toBe("arrow");
		expect(edge.fromEnd).toBe("none");
	});

	it("respects explicit edge ends", () => {
		const raw: RawCanvasEdge = { id: "e", fromNode: "a", toNode: "b", toEnd: "none", fromEnd: "arrow" };
		const edge = normalizeEdge(raw, nodes);
		expect(edge.toEnd).toBe("none");
		expect(edge.fromEnd).toBe("arrow");
	});
});
