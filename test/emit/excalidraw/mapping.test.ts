import { describe, expect, it } from "vitest";
import {
	mapCanvasToExcalidraw,
	renderTextForExcalidraw,
} from "../../../src/emit/excalidraw/mapping";
import type {
	CanvasModel,
	GroupNode,
	TextNode,
} from "../../../src/model/canvas-types";

function buildModel(nodes: TextNode[] | (TextNode | GroupNode)[]): CanvasModel {
	return {
		// `source` is unused by the mapper; cast to any-shaped object via unknown
		source: {} as unknown as CanvasModel["source"],
		nodes,
		edges: [],
		bounds: { x: 0, y: 0, w: 1000, h: 1000 },
		assets: [],
	};
}

const sampleText = (id: string, x = 0, y = 0): TextNode => ({
	kind: "text",
	id,
	x,
	y,
	w: 200,
	h: 100,
	html: `<p>${id}</p>`,
	rawMarkdown: id,
});

describe("renderTextForExcalidraw", () => {
	it("strips markdown syntax in strip mode", () => {
		const out = renderTextForExcalidraw("# Heading\n**Bold** and *italic* and `code`", "strip");
		expect(out).toBe("Heading\nBold and italic and code");
	});

	it("preserves the source in preserve mode", () => {
		const md = "# Heading\n**Bold** text";
		expect(renderTextForExcalidraw(md, "preserve")).toBe(md);
	});

	it("turns bullet lists into bullet glyphs in strip mode", () => {
		const out = renderTextForExcalidraw("- one\n- two", "strip");
		expect(out).toBe("• one\n• two");
	});
});

describe("mapCanvasToExcalidraw", () => {
	it("emits a rectangle plus bound text for each text node", () => {
		const model = buildModel([sampleText("a")]);
		const doc = mapCanvasToExcalidraw(model, { markdown: "strip" });
		const rectangles = doc.elements.filter((e) => e.type === "rectangle");
		const texts = doc.elements.filter((e) => e.type === "text");
		expect(rectangles).toHaveLength(1);
		expect(texts).toHaveLength(1);
		expect(rectangles[0]?.id).toBe("a");
		const textEl = texts[0];
		expect(textEl?.type).toBe("text");
		if (textEl?.type === "text") {
			expect(textEl.containerId).toBe("a");
		}
	});

	it("places group rectangles before content and assigns shared groupIds", () => {
		const group: GroupNode = {
			kind: "group",
			id: "g",
			x: 0,
			y: 0,
			w: 500,
			h: 500,
			label: "G",
		};
		const inside = sampleText("inner", 50, 50);
		const outside = sampleText("outer", 800, 800);
		const model = buildModel([group, inside, outside]);
		const doc = mapCanvasToExcalidraw(model, { markdown: "strip" });
		const innerRect = doc.elements.find((e) => e.id === "inner");
		const outerRect = doc.elements.find((e) => e.id === "outer");
		expect(innerRect?.groupIds).toEqual(["g"]);
		expect(outerRect?.groupIds).toEqual([]);
	});

	it("converts edges into bound arrows", () => {
		const a = sampleText("a", 0, 0);
		const b = sampleText("b", 400, 0);
		const model: CanvasModel = {
			source: {} as unknown as CanvasModel["source"],
			nodes: [a, b],
			edges: [{
				id: "edge",
				from: { node: "a", side: "right" },
				to: { node: "b", side: "left" },
				toEnd: "arrow",
				fromEnd: "none",
			}],
			bounds: { x: 0, y: 0, w: 600, h: 100 },
			assets: [],
		};
		const doc = mapCanvasToExcalidraw(model, { markdown: "strip" });
		const arrow = doc.elements.find((e) => e.type === "arrow");
		expect(arrow).toBeDefined();
		if (arrow?.type === "arrow") {
			expect(arrow.startBinding?.elementId).toBe("a");
			expect(arrow.endBinding?.elementId).toBe("b");
			expect(arrow.endArrowhead).toBe("arrow");
			expect(arrow.startArrowhead).toBe(null);
		}
	});

	it("reciprocally registers arrows on their bound shapes", () => {
		const a = sampleText("a", 0, 0);
		const b = sampleText("b", 400, 0);
		const model: CanvasModel = {
			source: {} as unknown as CanvasModel["source"],
			nodes: [a, b],
			edges: [{
				id: "edge",
				from: { node: "a", side: "right" },
				to: { node: "b", side: "left" },
				toEnd: "arrow",
				fromEnd: "none",
			}],
			bounds: { x: 0, y: 0, w: 600, h: 100 },
			assets: [],
		};
		const doc = mapCanvasToExcalidraw(model, { markdown: "strip" });
		const aRect = doc.elements.find((e) => e.id === "a");
		const bRect = doc.elements.find((e) => e.id === "b");
		expect(aRect?.boundElements).toContainEqual({ id: "edge", type: "arrow" });
		expect(bRect?.boundElements).toContainEqual({ id: "edge", type: "arrow" });
	});

	it("emits a bound text element for labeled edges", () => {
		const a = sampleText("a", 0, 0);
		const b = sampleText("b", 400, 0);
		const model: CanvasModel = {
			source: {} as unknown as CanvasModel["source"],
			nodes: [a, b],
			edges: [{
				id: "edge",
				from: { node: "a", side: "right" },
				to: { node: "b", side: "left" },
				toEnd: "arrow",
				fromEnd: "none",
				label: "depends on",
			}],
			bounds: { x: 0, y: 0, w: 600, h: 100 },
			assets: [],
		};
		const doc = mapCanvasToExcalidraw(model, { markdown: "strip" });
		const arrow = doc.elements.find((e) => e.id === "edge");
		const labelText = doc.elements.find((e) => e.id === "edge-label");
		expect(arrow?.boundElements).toEqual([{ id: "edge-label", type: "text" }]);
		expect(labelText?.type).toBe("text");
		if (labelText?.type === "text") {
			expect(labelText.text).toBe("depends on");
			expect(labelText.containerId).toBe("edge");
		}
	});

	it("distributes focus values across edges sharing a node side", () => {
		const center = sampleText("hub", 200, 200);
		const incoming = [
			sampleText("top1", 100, 0, 100, 50),
			sampleText("top2", 250, 0, 100, 50),
			sampleText("top3", 400, 0, 100, 50),
		];
		const model: CanvasModel = {
			source: {} as unknown as CanvasModel["source"],
			nodes: [center, ...incoming],
			edges: incoming.map((src) => ({
				id: `e-${src.id}`,
				from: { node: src.id, side: "bottom" as const },
				to: { node: "hub", side: "top" as const },
				toEnd: "arrow" as const,
				fromEnd: "none" as const,
			})),
			bounds: { x: 0, y: 0, w: 600, h: 400 },
			assets: [],
		};
		const doc = mapCanvasToExcalidraw(model, { markdown: "strip" });
		const arrows = doc.elements.filter((e) => e.type === "arrow");
		const endFocuses = arrows
			.flatMap((a) => (a.type === "arrow" && a.endBinding ? [a.endBinding.focus] : []))
			.sort((a, b) => a - b);
		// Three edges hit the same (hub, top) — they must occupy distinct focus slots.
		expect(new Set(endFocuses).size).toBe(3);
		expect(endFocuses[0]).toBeLessThan(0);
		expect(endFocuses[2]).toBeGreaterThan(0);
	});
});
