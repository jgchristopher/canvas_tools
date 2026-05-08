import { describe, expect, it } from "vitest";
import { mapCanvasToExcalidraw } from "../../../src/emit/excalidraw/mapping";
import { wrapAsObsidianExcalidraw } from "../../../src/emit/excalidraw/wrapper";
import type { CanvasModel, TextNode } from "../../../src/model/canvas-types";

const sampleNode: TextNode = {
	kind: "text",
	id: "a",
	x: 0,
	y: 0,
	w: 100,
	h: 100,
	html: "",
	rawMarkdown: "hello",
};

const model: CanvasModel = {
	source: {} as unknown as CanvasModel["source"],
	nodes: [sampleNode],
	edges: [],
	bounds: { x: 0, y: 0, w: 100, h: 100 },
	assets: [],
};

describe("Obsidian Excalidraw markdown wrapper", () => {
	const doc = mapCanvasToExcalidraw(model, { markdown: "strip" });
	const wrapped = wrapAsObsidianExcalidraw(doc);

	it("declares the parsed plugin frontmatter and excalidraw tag", () => {
		expect(wrapped.startsWith("---\n")).toBe(true);
		expect(wrapped).toContain("excalidraw-plugin: parsed");
		expect(wrapped).toContain("tags: [excalidraw]");
	});

	it("matches the plugin's drawing-section regex (DRAWING_REG)", () => {
		// Same shape as the regex obsidian-excalidraw-plugin uses to find the
		// raw JSON block. Verifies the wrapper survives the plugin's parser.
		const drawingReg = /Drawing\n[^`]*(```json\n)([\s\S]*?)```\n/m;
		const match = drawingReg.exec(wrapped);
		expect(match).not.toBeNull();
		const json = match?.[2] ?? "";
		const parsed = JSON.parse(json) as { type: string };
		expect(parsed.type).toBe("excalidraw");
	});

	it("ends with the trailing %% marker the plugin expects", () => {
		expect(wrapped.endsWith("%%")).toBe(true);
	});
});
