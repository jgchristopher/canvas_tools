# Interactive HTML Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the exported HTML interactive with ephemeral move + resize of nodes, edges following live, and a reset button. Default on, opt-out via setting.

**Architecture:** Embed the canvas state as a JSON sidecar in the page. The runtime hydrates it on load, snapshots the original for reset, and wires mouse/touch handlers. The same bezier path computation runs server-side (export-time) and client-side (drag-time), reused via a shared edge-geometry helper. No persistence: reload returns to the original layout.

**Tech Stack:** TypeScript, esbuild bundle, vitest for unit tests, vanilla DOM/SVG in the runtime.

---

## File Structure

**Create:**
- `src/emit/html/edge-geometry.ts` — pure bezier + anchor math, shared by server-side renderer and client-side runtime. Exports `anchorPoint`, `bezierPath`, `controlPoint`, `Anchor`, `BezierPath`.
- `test/emit/html/edge-geometry.test.ts` — unit tests for `anchorPoint` and `bezierPath`.
- `test/emit/html/state-sidecar.test.ts` — snapshot test for the JSON state block shape.

**Modify:**
- `src/settings.ts` — add `htmlInteractive: boolean` to settings, default `true`.
- `src/settings-tab.ts` — surface the toggle in the settings tab.
- `src/ui/export-modal.ts` — surface the toggle in the per-export modal.
- `src/emit/html/emitter.ts` — pass `interactive` flag through to packagers.
- `src/emit/html/package-folder.ts` — accept `interactive` flag, pass to renderer.
- `src/emit/html/package-single.ts` — accept `interactive` flag, pass to renderer.
- `src/emit/html/renderer.ts` — use `edge-geometry` helper; emit state sidecar, edge `data-id`, label `data-id`, and 8 resize handles per node when `interactive` is on.
- `src/emit/html/styles.ts` — handle visuals, hover outline, cursor variants, reset button.
- `src/emit/html/runtime.ts` — add `hitTest`, `dragManager`, `resizeManager`, `edgeUpdater`, `resetManager`, init wiring. The bezier math is duplicated here (in JS string form) but kept identical to `edge-geometry.ts` and covered by an integration test.

---

## Task 1: Extract edge geometry into a shared helper

**Files:**
- Create: `src/emit/html/edge-geometry.ts`
- Test: `test/emit/html/edge-geometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/emit/html/edge-geometry.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- test/emit/html/edge-geometry.test.ts`
Expected: FAIL — module `../../../src/emit/html/edge-geometry` not found.

- [ ] **Step 3: Create the helper module**

Create `src/emit/html/edge-geometry.ts`:

```ts
import type { Bounds, CanvasSide } from "../../model/canvas-types";

export interface Anchor {
	x: number;
	y: number;
}

export interface NodeGeometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface BezierPath {
	d: string;
	midX: number;
	midY: number;
}

export function anchorPoint(node: NodeGeometry, side: CanvasSide, bounds: Bounds): Anchor {
	const relX = node.x - bounds.x;
	const relY = node.y - bounds.y;
	switch (side) {
		case "top":
			return { x: relX + node.w / 2, y: relY };
		case "right":
			return { x: relX + node.w, y: relY + node.h / 2 };
		case "bottom":
			return { x: relX + node.w / 2, y: relY + node.h };
		case "left":
			return { x: relX, y: relY + node.h / 2 };
	}
}

export function bezierPath(a: Anchor, aSide: CanvasSide, b: Anchor, bSide: CanvasSide): BezierPath {
	const offset = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.3);
	const c1 = controlPoint(a, aSide, offset);
	const c2 = controlPoint(b, bSide, offset);
	const midX = (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8;
	const midY = (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8;
	return { d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`, midX, midY };
}

export function controlPoint(p: Anchor, side: CanvasSide, offset: number): Anchor {
	switch (side) {
		case "top":
			return { x: p.x, y: p.y - offset };
		case "right":
			return { x: p.x + offset, y: p.y };
		case "bottom":
			return { x: p.x, y: p.y + offset };
		case "left":
			return { x: p.x - offset, y: p.y };
	}
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- test/emit/html/edge-geometry.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Refactor renderer.ts to use the helper**

In `src/emit/html/renderer.ts`, replace the local `anchor`, `bezierPath`, and `controlPoint` functions with imports from `./edge-geometry`. Update call sites:

- Replace `function anchor(...)`, `function bezierPath(...)`, `function controlPoint(...)` with: `import { anchorPoint, bezierPath, type Anchor } from "./edge-geometry";`
- Inside `renderEdges`: change `const start = anchor(from, edge.from.side, model);` to `const start = anchorPoint(from, edge.from.side, model.bounds);`. Same for `end`.
- Remove the now-unused `Anchor` interface declaration in the file (use the imported one).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS, all tests including the existing renderer-related ones.

- [ ] **Step 7: Run the build**

Run: `npm run build`
Expected: clean build, no TS errors.

- [ ] **Step 8: Commit**

```bash
git add src/emit/html/edge-geometry.ts src/emit/html/renderer.ts test/emit/html/edge-geometry.test.ts
git commit -m "Extract edge geometry helper for reuse by client runtime"
```

---

## Task 2: Add the htmlInteractive setting and plumb it through

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/settings-tab.ts`
- Modify: `src/ui/export-modal.ts`
- Modify: `src/emit/html/emitter.ts`
- Modify: `src/emit/html/package-folder.ts`
- Modify: `src/emit/html/package-single.ts`

- [ ] **Step 1: Add the setting field**

In `src/settings.ts`, add to `CanvasToolsSettings` interface (alphabetical-ish, near other HTML settings):

```ts
	htmlInteractive: boolean;
```

Add to `DEFAULT_SETTINGS`:

```ts
	htmlInteractive: true,
```

- [ ] **Step 2: Surface in the settings tab**

In `src/settings-tab.ts`, after the "Open after export" setting (still in the "HTML export" section), add:

```ts
		new Setting(containerEl)
			.setName("Interactive HTML output")
			.setDesc("Allow viewers to drag and resize nodes in the exported HTML. Reload restores the original layout.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.htmlInteractive).onChange(async (value) => {
					this.plugin.settings.htmlInteractive = value;
					await this.plugin.saveSettings();
				}),
			);
```

- [ ] **Step 3: Surface in the export modal**

In `src/ui/export-modal.ts`, add to `DraftOptions`:

```ts
	interactive: boolean;
```

Initialize from settings in the constructor:

```ts
			interactive: s.htmlInteractive,
```

In `render()`, inside the HTML branch (the one with the packaging dropdown), add after the "Open after export" toggle:

```ts
			new Setting(contentEl)
				.setName("Interactive output")
				.setDesc("Drag and resize nodes in the browser. Reload restores the original layout.")
				.addToggle((t) =>
					t.setValue(this.draft.interactive).onChange((value) => {
						this.draft.interactive = value;
					}),
				);
```

In `performExport`, pass `interactive: this.draft.interactive` to `exportCanvasToHtml`'s options.

- [ ] **Step 4: Plumb through the emitter**

In `src/emit/html/emitter.ts`:

- Add to `HtmlExportOptions`:

```ts
	interactive?: boolean;
```

- In `exportCanvasToHtml`, after computing `packaging`:

```ts
	const interactive = opts.interactive ?? deps.settings.htmlInteractive;
```

- Pass `interactive` to both packagers:

```ts
		const result = await packageAsFolder(model, writer, slug, title, interactive);
```

```ts
	const result = await packageAsSingleFile(model, writer, `${slug}.html`, title, interactive);
```

- [ ] **Step 5: Plumb through the packagers**

In `src/emit/html/package-folder.ts`, change `packageAsFolder` signature to accept `interactive: boolean`:

```ts
export async function packageAsFolder(
	model: CanvasModel,
	writer: OutputWriter,
	folderName: string,
	title: string,
	interactive: boolean,
): Promise<FolderPackageResult> {
```

Pass it to `renderModelToHtml` (we'll add the parameter in Task 3):

```ts
	const rendered = renderModelToHtml(model, {
		imageHref: (asset) => `assets/images/${asset.id}.${guessExt(asset.mime)}`,
		interactive,
	});
```

Same change in `src/emit/html/package-single.ts` — add `interactive: boolean` parameter and pass it through to `renderModelToHtml`.

- [ ] **Step 6: Build and verify type-check**

Run: `npm run build`
Expected: PASS. (The renderer doesn't yet accept `interactive` — temporary inconsistency; resolved in Task 3.)

If the build fails because `renderModelToHtml`'s options type doesn't include `interactive`, that's the expected next step. Either:

- Temporarily mark the new option as optional and ignored, then tighten in Task 3, OR
- Skip Step 6 here and run the build at the end of Task 3.

For tidiness, prefer the latter — accept that this task's work is verified together with Task 3.

- [ ] **Step 7: Commit**

```bash
git add src/settings.ts src/settings-tab.ts src/ui/export-modal.ts src/emit/html/emitter.ts src/emit/html/package-folder.ts src/emit/html/package-single.ts
git commit -m "Plumb htmlInteractive setting through to the packagers"
```

(If build fails at this step due to renderer not accepting `interactive` yet, defer the commit until Task 3 builds clean.)

---

## Task 3: Emit the state sidecar in the renderer

**Files:**
- Modify: `src/emit/html/renderer.ts`
- Test: `test/emit/html/state-sidecar.test.ts`

- [ ] **Step 1: Write the snapshot test**

Create `test/emit/html/state-sidecar.test.ts`:

```ts
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
		expect(out.body).toContain('data-id="e1"');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- test/emit/html/state-sidecar.test.ts`
Expected: FAIL — `interactive` option not in `RenderOptions`, sidecar not emitted.

- [ ] **Step 3: Update the renderer**

In `src/emit/html/renderer.ts`:

- Add to `RenderOptions`:

```ts
export interface RenderOptions {
	imageHref: (asset: AssetRef) => string;
	interactive: boolean;
}
```

- In `renderModelToHtml`, after computing `nodeHtml` and `edgeSvg`, before returning:

```ts
	const sidecar = opts.interactive ? renderStateSidecar(model) : "";
	const handlesAttr = opts.interactive ? ' data-interactive="true"' : "";
	const dataBounds = JSON.stringify(bounds);
	const body = `<div class="ct-canvas"${handlesAttr} data-bounds='${escapeAttr(dataBounds)}' style="width:${bounds.w}px;height:${bounds.h}px;">${edgeSvg}${nodeHtml}${sidecar}</div>`;
	return { body, assetIds: used };
}

function renderStateSidecar(model: CanvasModel): string {
	const state = {
		nodes: model.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, kind: n.kind })),
		edges: model.edges.map((e) => ({
			id: e.id,
			from: e.from,
			to: e.to,
			label: e.label,
			color: e.color,
			toEnd: e.toEnd,
			fromEnd: e.fromEnd,
		})),
		bounds: model.bounds,
	};
	return `<script type="application/json" id="ct-state">${JSON.stringify(state)}</script>`;
}
```

- In `renderEdges`, add `data-id="${escapeAttr(edge.id)}"` to each `<path>` and to each `<text>` label:

```ts
		paths.push(`<path data-id="${escapeAttr(edge.id)}" d="${path.d}" stroke="${stroke}" ${markerEnd} ${markerStart}></path>`);
```

```ts
			labels.push(`<text data-id="${escapeAttr(edge.id)}" class="ct-edge-label" x="${path.midX}" y="${path.midY}" text-anchor="middle" dominant-baseline="central">${escapeHtml(edge.label)}</text>`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- test/emit/html/state-sidecar.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass. (Other tests that call `renderModelToHtml` may need `interactive: false` added.)

If a pre-existing test fails because `interactive` is now required: update the test invocation to pass `interactive: false`.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/emit/html/renderer.ts test/emit/html/state-sidecar.test.ts
git commit -m "Emit state sidecar and edge data-ids for client runtime"
```

If you deferred Task 2's commit, run `git status` and stage/commit those files together with this commit, or as a separate commit named "Plumb htmlInteractive setting through to the packagers".

---

## Task 4: Emit resize handles per node

**Files:**
- Modify: `src/emit/html/renderer.ts`

- [ ] **Step 1: Add resize handles in `renderNode`**

In `src/emit/html/renderer.ts`, define a helper at module scope (near the bottom with the other small helpers):

```ts
function renderHandles(): string {
	return [
		'<div class="ct-handle ct-handle-nw" data-resize="nw"></div>',
		'<div class="ct-handle ct-handle-n" data-resize="n"></div>',
		'<div class="ct-handle ct-handle-ne" data-resize="ne"></div>',
		'<div class="ct-handle ct-handle-e" data-resize="e"></div>',
		'<div class="ct-handle ct-handle-se" data-resize="se"></div>',
		'<div class="ct-handle ct-handle-s" data-resize="s"></div>',
		'<div class="ct-handle ct-handle-sw" data-resize="sw"></div>',
		'<div class="ct-handle ct-handle-w" data-resize="w"></div>',
	].join("");
}
```

Update `renderNode` to accept the `interactive` flag and append `renderHandles()` to each node's inner HTML when interactive:

```ts
function renderNode(
	node: CanvasNode,
	model: CanvasModel,
	opts: RenderOptions,
	used: Set<string>,
): string {
	const inner = renderNodeInner(node, model, opts, used);
	const handles = opts.interactive ? renderHandles() : "";
	return wrapNode(node, model, inner + handles);
}
```

This requires extracting the existing per-kind rendering into `renderNodeInner` and a thin wrapper `wrapNode`. Refactor as follows:

```ts
function renderNodeInner(node: CanvasNode, model: CanvasModel, opts: RenderOptions, used: Set<string>): string {
	switch (node.kind) {
		case "text":
			return node.html;
		case "file":
			return renderFileInner(node, model, opts, used);
		case "link":
			return renderLinkInner(node, model, opts, used);
		case "group":
			return node.label ? `<div class="ct-group-label">${escapeHtml(node.label)}</div>` : "";
	}
}

function wrapNode(node: CanvasNode, model: CanvasModel, inner: string): string {
	const left = node.x - model.bounds.x;
	const top = node.y - model.bounds.y;
	const colorClass = node.color ? colorClassFor(node.color) : "";
	const style = `left:${left}px;top:${top}px;width:${node.w}px;height:${node.h}px;`;
	const kindClass = node.kind === "file"
		? `ct-node-file${node.imageAssetId ? " ct-image" : ""}${node.missing ? " ct-missing" : ""}`
		: `ct-node-${node.kind}`;
	return `<div class="ct-node ${kindClass} ${colorClass}" data-id="${escapeAttr(node.id)}" style="${style}">${inner}</div>`;
}
```

The previous per-kind functions (`renderTextNode`, `renderFileNode`, `renderLinkNode`, `renderGroupNode`) become `renderFileInner` and `renderLinkInner` (text and group inners are simple enough to inline). Keep behavior identical: same classes, same inner HTML, same link card markup.

- [ ] **Step 2: Build to confirm refactor compiles**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/emit/html/renderer.ts
git commit -m "Emit 8 resize handles per node when interactive"
```

---

## Task 5: Add styles for handles, hover state, and reset button

**Files:**
- Modify: `src/emit/html/styles.ts`

- [ ] **Step 1: Append handle and interactive styles**

In `src/emit/html/styles.ts`, append the following CSS to the `HTML_STYLES` template literal (before the closing backtick):

```css
.ct-canvas[data-interactive="true"] .ct-node:hover { outline: 1px solid var(--ct-accent); cursor: grab; }
.ct-canvas[data-interactive="true"] .ct-node.ct-dragging { cursor: grabbing; outline: 2px solid var(--ct-accent); }
.ct-handle { position: absolute; width: 10px; height: 10px; background: var(--ct-accent); border: 1px solid var(--ct-bg); border-radius: 2px; opacity: 0; transition: opacity 0.1s; pointer-events: auto; z-index: 2; }
.ct-canvas[data-interactive="true"] .ct-node:hover .ct-handle,
.ct-canvas[data-interactive="true"] .ct-node.ct-dragging .ct-handle { opacity: 1; }
.ct-handle-nw { left: -5px; top: -5px; cursor: nwse-resize; }
.ct-handle-n  { left: calc(50% - 5px); top: -5px; cursor: ns-resize; }
.ct-handle-ne { right: -5px; top: -5px; cursor: nesw-resize; }
.ct-handle-e  { right: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.ct-handle-se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.ct-handle-s  { left: calc(50% - 5px); bottom: -5px; cursor: ns-resize; }
.ct-handle-sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.ct-handle-w  { left: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.ct-toolbar button[data-act="reset"] { font-size: 12px; padding: 0 8px; width: auto; }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/emit/html/styles.ts
git commit -m "Add resize handle and interactive node styles"
```

---

## Task 6: Add hit testing and the runtime state hydration

**Files:**
- Modify: `src/emit/html/runtime.ts`

This task and the next three rewrite the runtime in named sections. Each task replaces or appends a section. The runtime is a single template-literal export; treat each task's diff as the canonical block for that section.

- [ ] **Step 1: Replace the entire runtime with a sectioned skeleton**

Replace the contents of `src/emit/html/runtime.ts` with:

```ts
export const HTML_RUNTIME = `
(function () {
	// ── State hydration ──────────────────────────────────────────────────────
	var viewport = document.querySelector('.ct-viewport');
	var canvas = document.querySelector('.ct-canvas');
	if (!viewport || !canvas) return;

	var bounds = JSON.parse(canvas.getAttribute('data-bounds') || '{"x":0,"y":0,"w":0,"h":0}');
	var interactive = canvas.getAttribute('data-interactive') === 'true';
	var stateEl = document.getElementById('ct-state');
	var state = stateEl ? JSON.parse(stateEl.textContent || '{}') : { nodes: [], edges: [] };
	var nodeMap = {};
	for (var i = 0; i < (state.nodes || []).length; i++) nodeMap[state.nodes[i].id] = state.nodes[i];

	// Index edges by node for fast lookup during drag/resize
	var edgesByNode = {};
	for (var j = 0; j < (state.edges || []).length; j++) {
		var e = state.edges[j];
		(edgesByNode[e.from.node] = edgesByNode[e.from.node] || []).push(e);
		(edgesByNode[e.to.node] = edgesByNode[e.to.node] || []).push(e);
	}

	// Snapshot of the original layout for reset
	var original = JSON.parse(JSON.stringify(state));

	// ── Pan / zoom (existing behaviour) ──────────────────────────────────────
	var view = { tx: 0, ty: 0, scale: 1 };
	var minScale = 0.1, maxScale = 4;
	function applyView() {
		canvas.style.transform = 'translate(' + view.tx + 'px,' + view.ty + 'px) scale(' + view.scale + ')';
	}
	function fit() {
		if (!bounds.w || !bounds.h) return;
		var pad = 40;
		var sx = (viewport.clientWidth - pad * 2) / bounds.w;
		var sy = (viewport.clientHeight - pad * 2) / bounds.h;
		var s = Math.min(sx, sy, 1);
		view.scale = s;
		view.tx = pad - bounds.x * s + (viewport.clientWidth - pad * 2 - bounds.w * s) / 2;
		view.ty = pad - bounds.y * s + (viewport.clientHeight - pad * 2 - bounds.h * s) / 2;
		applyView();
	}
	function zoomAt(clientX, clientY, factor) {
		var next = Math.max(minScale, Math.min(maxScale, view.scale * factor));
		var actual = next / view.scale;
		view.tx = clientX - (clientX - view.tx) * actual;
		view.ty = clientY - (clientY - view.ty) * actual;
		view.scale = next;
		applyView();
	}
	viewport.addEventListener('wheel', function (e) {
		e.preventDefault();
		zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
	}, { passive: false });

	// ── Hit testing ──────────────────────────────────────────────────────────
	function hitTest(target) {
		var el = target;
		while (el && el !== viewport) {
			if (el.tagName === 'A') return { kind: 'link' };
			if (el.classList && el.classList.contains('ct-handle')) {
				var nodeEl = el.parentElement;
				var nodeId = nodeEl && nodeEl.getAttribute('data-id');
				if (nodeId) return { kind: 'resize', nodeId: nodeId, anchor: el.getAttribute('data-resize'), nodeEl: nodeEl };
			}
			if (el.classList && el.classList.contains('ct-node') && !el.classList.contains('ct-node-group')) {
				var id = el.getAttribute('data-id');
				if (id) return { kind: 'move', nodeId: id, nodeEl: el };
			}
			el = el.parentElement;
		}
		return { kind: 'pan' };
	}

	// Helpers exposed for the next runtime sections
	window.__ctRuntime = { state: state, nodeMap: nodeMap, edgesByNode: edgesByNode, original: original, view: view, viewport: viewport, canvas: canvas, hitTest: hitTest, interactive: interactive, applyView: applyView, fit: fit, zoomAt: zoomAt };

	// ── Pan-on-empty-space and click-vs-drag (placeholder, fleshed out next) ─
	// Subsequent tasks register mouse handlers that consult hitTest first.

	window.addEventListener('resize', fit);
	fit();
})();
`;
```

`window.__ctRuntime` is a temporary scaffold so the following tasks can append code in clearly-named sections without merging conflicts. The final task removes it (closes everything inside one IIFE).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manually verify pan/zoom still works**

Symlink/copy the build into your test vault, export a small canvas with `interactive: true`, open the HTML in a browser, and confirm pan/zoom still work and there are no console errors. (Drag/resize/reset are not yet implemented.)

- [ ] **Step 4: Commit**

```bash
git add src/emit/html/runtime.ts
git commit -m "Hydrate runtime state and split into named sections"
```

---

## Task 7: Implement the drag manager (move)

**Files:**
- Modify: `src/emit/html/runtime.ts`

- [ ] **Step 1: Replace the placeholder pan/drag section**

In `src/emit/html/runtime.ts`, replace the comment block `// ── Pan-on-empty-space and click-vs-drag (placeholder, fleshed out next) ─` and the lines below it (up to but not including the `window.addEventListener('resize', fit);` line) with:

```js
	// ── Drag (pan + node move) ───────────────────────────────────────────────
	var DRAG_THRESHOLD = 3;
	var active = null;
	function startActive(target, e) {
		var hit = hitTest(target);
		if (hit.kind === 'link') return null;
		return { hit: hit, startX: e.clientX, startY: e.clientY, panTx: view.tx, panTy: view.ty, committed: false, frame: null };
	}
	viewport.addEventListener('mousedown', function (e) {
		if (e.button !== 0) return;
		active = startActive(e.target, e);
	});
	window.addEventListener('mousemove', function (e) {
		if (!active) return;
		var dx = e.clientX - active.startX;
		var dy = e.clientY - active.startY;
		if (!active.committed) {
			if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
			active.committed = true;
			if (active.hit.kind === 'move') {
				active.startNode = { x: nodeMap[active.hit.nodeId].x, y: nodeMap[active.hit.nodeId].y };
				active.hit.nodeEl.classList.add('ct-dragging');
			} else if (active.hit.kind === 'pan') {
				viewport.classList.add('ct-panning');
			}
		}
		if (!interactive && active.hit.kind !== 'pan') return;
		if (active.hit.kind === 'pan') {
			view.tx = active.panTx + dx;
			view.ty = active.panTy + dy;
			applyView();
			return;
		}
		if (active.hit.kind === 'move') {
			var n = nodeMap[active.hit.nodeId];
			n.x = active.startNode.x + dx / view.scale;
			n.y = active.startNode.y + dy / view.scale;
			active.hit.nodeEl.style.left = (n.x - bounds.x) + 'px';
			active.hit.nodeEl.style.top = (n.y - bounds.y) + 'px';
			scheduleEdgeUpdate(active.hit.nodeId);
		}
	});
	window.addEventListener('mouseup', function () {
		if (active && active.committed) {
			if (active.hit.kind === 'move') active.hit.nodeEl.classList.remove('ct-dragging');
			if (active.hit.kind === 'pan') viewport.classList.remove('ct-panning');
		}
		active = null;
	});

	// ── Edge updater (stub; real implementation in next task) ────────────────
	function scheduleEdgeUpdate(_nodeId) { /* implemented in next task */ }
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manually verify**

Re-export and open the HTML. Confirm:
- Dragging empty space still pans
- Dragging a node body moves it; the node's position updates as you drag
- Edges do NOT yet update — they stay attached to the original position (expected, fixed next)
- Clicking a link inside a node still navigates (no movement under the 3px threshold)

- [ ] **Step 4: Commit**

```bash
git add src/emit/html/runtime.ts
git commit -m "Add drag manager: move nodes with click-vs-drag threshold"
```

---

## Task 8: Implement the edge updater

**Files:**
- Modify: `src/emit/html/runtime.ts`

- [ ] **Step 1: Replace the edge-updater stub with the real implementation**

In `src/emit/html/runtime.ts`, replace:

```js
	// ── Edge updater (stub; real implementation in next task) ────────────────
	function scheduleEdgeUpdate(_nodeId) { /* implemented in next task */ }
```

with:

```js
	// ── Edge updater ─────────────────────────────────────────────────────────
	var pendingEdges = {};
	var rafScheduled = false;
	function scheduleEdgeUpdate(nodeId) {
		var list = edgesByNode[nodeId] || [];
		for (var i = 0; i < list.length; i++) pendingEdges[list[i].id] = list[i];
		if (rafScheduled) return;
		rafScheduled = true;
		requestAnimationFrame(flushEdgeUpdates);
	}
	function flushEdgeUpdates() {
		rafScheduled = false;
		for (var id in pendingEdges) {
			if (Object.prototype.hasOwnProperty.call(pendingEdges, id)) updateEdge(pendingEdges[id]);
		}
		pendingEdges = {};
	}
	function updateEdge(edge) {
		var from = nodeMap[edge.from.node];
		var to = nodeMap[edge.to.node];
		if (!from || !to) return;
		var a = anchor(from, edge.from.side);
		var b = anchor(to, edge.to.side);
		var path = bezier(a, edge.from.side, b, edge.to.side);
		var pathEl = canvas.querySelector('.ct-edges path[data-id="' + cssEscape(edge.id) + '"]');
		var labelEl = canvas.querySelector('.ct-edges text[data-id="' + cssEscape(edge.id) + '"]');
		if (pathEl) pathEl.setAttribute('d', path.d);
		if (labelEl) { labelEl.setAttribute('x', String(path.midX)); labelEl.setAttribute('y', String(path.midY)); }
	}
	function anchor(n, side) {
		var rx = n.x - bounds.x, ry = n.y - bounds.y;
		if (side === 'top')    return { x: rx + n.w / 2, y: ry };
		if (side === 'right')  return { x: rx + n.w,     y: ry + n.h / 2 };
		if (side === 'bottom') return { x: rx + n.w / 2, y: ry + n.h };
		return                       { x: rx,            y: ry + n.h / 2 };
	}
	function bezier(a, aSide, b, bSide) {
		var off = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.3);
		var c1 = ctrl(a, aSide, off), c2 = ctrl(b, bSide, off);
		var midX = (a.x + 3*c1.x + 3*c2.x + b.x) / 8;
		var midY = (a.y + 3*c1.y + 3*c2.y + b.y) / 8;
		return { d: 'M ' + a.x + ' ' + a.y + ' C ' + c1.x + ' ' + c1.y + ', ' + c2.x + ' ' + c2.y + ', ' + b.x + ' ' + b.y, midX: midX, midY: midY };
	}
	function ctrl(p, side, off) {
		if (side === 'top')    return { x: p.x,        y: p.y - off };
		if (side === 'right')  return { x: p.x + off,  y: p.y };
		if (side === 'bottom') return { x: p.x,        y: p.y + off };
		return                       { x: p.x - off,  y: p.y };
	}
	function cssEscape(s) { return s.replace(/[^a-zA-Z0-9_-]/g, function (c) { return '\\\\' + c; }); }
```

The `anchor`, `bezier`, and `ctrl` functions mirror the math in `src/emit/html/edge-geometry.ts` exactly. If you ever change the math, change both places. (A future enhancement would be to bundle a single shared JS module instead of duplicating; out of scope here.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manually verify**

Re-export and drag a node: edges should now follow live, with their labels repositioning at the new bezier midpoint. Drag a node connected to multiple edges: all connected edges should update in the same frame (no flicker).

- [ ] **Step 4: Commit**

```bash
git add src/emit/html/runtime.ts
git commit -m "Live-update edges and labels during drag via rAF batching"
```

---

## Task 9: Implement the resize manager

**Files:**
- Modify: `src/emit/html/runtime.ts`

- [ ] **Step 1: Add resize handling to the drag flow**

In `src/emit/html/runtime.ts`, in the `mousemove` handler block, add a third branch after the `move` branch (just before the closing `}`):

Locate:

```js
		if (active.hit.kind === 'move') {
			// ... existing move logic ...
			scheduleEdgeUpdate(active.hit.nodeId);
		}
	});
```

And insert before the closing `});`:

```js
		if (active.hit.kind === 'resize') {
			var rn = nodeMap[active.hit.nodeId];
			if (!active.startResize) active.startResize = { x: rn.x, y: rn.y, w: rn.w, h: rn.h };
			var resized = applyResize(active.startResize, active.hit.anchor, dx / view.scale, dy / view.scale);
			rn.x = resized.x; rn.y = resized.y; rn.w = resized.w; rn.h = resized.h;
			active.hit.nodeEl.style.left = (rn.x - bounds.x) + 'px';
			active.hit.nodeEl.style.top = (rn.y - bounds.y) + 'px';
			active.hit.nodeEl.style.width = rn.w + 'px';
			active.hit.nodeEl.style.height = rn.h + 'px';
			scheduleEdgeUpdate(active.hit.nodeId);
		}
```

In the `startActive` function, when committing on resize we don't need to add the dragging class — the `:hover` keeps handles visible during resize. But add `cursor: <handle-cursor>` body override is unnecessary; the handle's own CSS cursor takes effect.

Add the `applyResize` helper inside the IIFE, near the other helpers (e.g., right after `cssEscape`):

```js
	function applyResize(start, anchor, dx, dy) {
		var MIN = 40;
		var x = start.x, y = start.y, w = start.w, h = start.h;
		if (anchor.indexOf('w') >= 0) { var newW = Math.max(MIN, w - dx); x = x + (w - newW); w = newW; }
		if (anchor.indexOf('e') >= 0) { w = Math.max(MIN, w + dx); }
		if (anchor.indexOf('n') >= 0) { var newH = Math.max(MIN, h - dy); y = y + (h - newH); h = newH; }
		if (anchor.indexOf('s') >= 0) { h = Math.max(MIN, h + dy); }
		return { x: x, y: y, w: w, h: h };
	}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manually verify all 8 handles**

Re-export. Hover a node: 8 grippers should appear. Drag each in turn:
- NW, N, NE, E, SE, S, SW, W

For each, verify:
- The opposite anchor stays fixed
- Minimum size 40x40 is enforced
- Edges follow live

- [ ] **Step 4: Commit**

```bash
git add src/emit/html/runtime.ts
git commit -m "Add resize manager with 8 handles and minimum size"
```

---

## Task 10: Add the reset button

**Files:**
- Modify: `src/emit/html/runtime.ts`

- [ ] **Step 1: Find the toolbar section**

Locate the toolbar construction in `src/emit/html/runtime.ts` (currently inside the section that ends with `window.addEventListener('resize', fit); fit();`). The existing toolbar code looks like:

```js
	var toolbar = document.createElement('div');
	toolbar.className = 'ct-toolbar';
	toolbar.innerHTML =
		'<button data-act="zoom-in" title="Zoom in">+</button>' +
		'<button data-act="zoom-out" title="Zoom out">−</button>' +
		'<button data-act="fit" title="Fit to view">⤢</button>';
```

Note: the previous tasks may have left the toolbar inside `__ctRuntime` scaffolding or the original location. Use `git grep "ct-toolbar"` to find the canonical block.

- [ ] **Step 2: Add the reset button and handler**

If the toolbar is still in `runtime.ts` from the original code, keep it there. Add a reset button when interactive:

```js
	if (interactive) {
		toolbar.insertAdjacentHTML('beforeend', '<button data-act="reset" title="Reset layout">Reset</button>');
	}
```

In the toolbar click handler (the existing `toolbar.addEventListener('click', ...)`), add a `reset` branch:

```js
		else if (act === 'reset') resetLayout();
```

Add the `resetLayout` function inside the IIFE:

```js
	function resetLayout() {
		var ids = [];
		for (var i = 0; i < original.nodes.length; i++) {
			var orig = original.nodes[i];
			var cur = nodeMap[orig.id];
			cur.x = orig.x; cur.y = orig.y; cur.w = orig.w; cur.h = orig.h;
			var el = canvas.querySelector('.ct-node[data-id="' + cssEscape(orig.id) + '"]');
			if (el) {
				el.style.left = (cur.x - bounds.x) + 'px';
				el.style.top = (cur.y - bounds.y) + 'px';
				el.style.width = cur.w + 'px';
				el.style.height = cur.h + 'px';
			}
			ids.push(orig.id);
		}
		for (var j = 0; j < ids.length; j++) scheduleEdgeUpdate(ids[j]);
	}
```

- [ ] **Step 3: Remove the `__ctRuntime` scaffolding**

If `window.__ctRuntime = { ... }` is still in the file from Task 6, delete that line. All sections now share scope inside the same IIFE.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, all tests.

- [ ] **Step 6: Manually verify the reset button**

Export, drag/resize a few nodes, click **Reset**. All nodes return to their original positions and sizes. Edges follow.

Reload the page: original positions/sizes still load (no localStorage involved).

- [ ] **Step 7: Commit**

```bash
git add src/emit/html/runtime.ts
git commit -m "Add reset button to restore original layout"
```

---

## Task 11: Final integration sweep

**Files:** none modified — verification only.

- [ ] **Step 1: Run all checks**

```bash
npm test && npm run build && npm run lint
```

Expected: all green.

- [ ] **Step 2: Verify the bundle size**

```bash
ls -la main.js
```

Expected: roughly 50–55 KB (up from ~43 KB pre-feature). Flag if it's significantly larger.

- [ ] **Step 3: End-to-end manual test against a real canvas**

In your test vault, export a multi-node, multi-edge canvas with images and labels. Open the resulting HTML in a browser. Verify:

- Pan/zoom still works
- Drag any non-group node — it moves; edges follow
- Resize from each of the 8 handles — opposite anchor stays fixed; min size 40x40 enforced
- Click a markdown link inside a node — navigates correctly (3px threshold)
- Group nodes do not respond to drag (intended; they're spatial-only)
- Reset button restores original layout
- Reload page — original layout returns
- Disable `htmlInteractive` in settings, re-export — output has no handles, no reset button, smaller HTML, no console state sidecar

- [ ] **Step 4: End-of-feature commit**

If any cleanup is needed (stale comments, unused imports), do it now:

```bash
git status
git add -p
git commit -m "Polish interactive HTML export"
```

---

## Verification checklist

- [ ] Edge geometry helper is the single source of truth for path math (server-side). Runtime duplicates it intentionally; both are kept in sync.
- [ ] State sidecar JSON is emitted only when `interactive` is true.
- [ ] Edge `<path>` and `<text>` elements both carry `data-id`.
- [ ] Click on links within nodes still navigates (3px threshold).
- [ ] Drag updates node position AND edges in the same animation frame (no visible lag).
- [ ] Resize from all 8 handles works; opposite anchor fixed; min 40x40.
- [ ] Reset button restores all positions and sizes.
- [ ] Reload restores original layout (no persistence).
- [ ] `htmlInteractive: false` produces a smaller, view-only HTML with no interactive scaffolding.
- [ ] All unit tests pass; lint clean; build clean.
