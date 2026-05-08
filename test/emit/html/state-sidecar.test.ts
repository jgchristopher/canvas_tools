import { describe, expect, it } from "vitest";
import { renderModelToHtml } from "../../../src/emit/html/renderer";
import type { CanvasModel, TextNode } from "../../../src/model/canvas-types";

const node = (id: string, x: number, y: number, w = 100, h = 80): TextNode => ({
	kind: "text",
	id,
	x,
	y,
	w,
	h,
	html: `<p>${id}</p>`,
	rawMarkdown: id,
});

const model: CanvasModel = {
	source: {} as unknown as CanvasModel["source"],
	nodes: [node("a", 0, 0), node("b", 200, 0)],
	edges: [{
		id: "e1",
		from: { node: "a", side: "right" },
		to: { node: "b", side: "left" },
		toEnd: "arrow",
		fromEnd: "none",
		label: "to b",
	}],
	bounds: { x: 0, y: 0, w: 300, h: 80 },
	assets: [],
};

describe("state sidecar", () => {
	it("emits a JSON sidecar when interactive is true", () => {
		const out = renderModelToHtml(model, { imageHref: () => "", interactive: true });
		const match = /<script type="application\/json" id="ct-state">([\s\S]+?)<\/script>/.exec(out.body);
		expect(match).not.toBeNull();
		const state = JSON.parse(match?.[1] ?? "{}") as {
			nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>;
			edges: Array<{ id: string; from: { node: string; side: string }; to: { node: string; side: string } }>;
			bounds: { x: number; y: number; w: number; h: number };
		};
		expect(state.nodes).toHaveLength(2);
		expect(state.nodes[0]?.id).toBe("a");
		expect(state.edges[0]?.id).toBe("e1");
		expect(state.bounds).toEqual({ x: 0, y: 0, w: 300, h: 80 });
	});

	it("omits the sidecar when interactive is false", () => {
		const out = renderModelToHtml(model, { imageHref: () => "", interactive: false });
		expect(out.body).not.toContain('id="ct-state"');
	});

	it("adds data-id to edge paths and labels for runtime addressing", () => {
		const out = renderModelToHtml(model, { imageHref: () => "", interactive: true });
		expect(out.body).toContain('<path data-id="e1"');
		expect(out.body).toContain('<text data-id="e1"');
	});

	it("escapes </ inside the JSON sidecar so the script element cannot be closed prematurely", () => {
		const dangerous: TextNode = {
			kind: "text",
			id: "x</script>y",
			x: 0,
			y: 0,
			w: 100,
			h: 100,
			html: "",
			rawMarkdown: "",
		};
		const danger: CanvasModel = {
			source: {} as unknown as CanvasModel["source"],
			nodes: [dangerous],
			edges: [],
			bounds: { x: 0, y: 0, w: 100, h: 100 },
			assets: [],
		};
		const out = renderModelToHtml(danger, { imageHref: () => "", interactive: true });
		// extract the script content and verify the id is escaped
		const scriptMatch = /<script type="application\/json" id="ct-state">([\s\S]+?)<\/script>/.exec(out.body);
		expect(scriptMatch).not.toBeNull();
		const state = JSON.parse(scriptMatch?.[1] ?? "{}");
		// verify the dangerous string is preserved correctly after round-trip
		expect(state.nodes[0]?.id).toBe("x</script>y");
	});
});
