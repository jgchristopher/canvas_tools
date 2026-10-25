# Canvas Path Highlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named, hand-marked edge paths per canvas, highlighted one at a time ("dim the rest") in the live Obsidian canvas view, driven from a toolbar button, touch-friendly, safe across synced machines.

**Architecture:** Pure path-set functions (`path-model`) under a per-canvas JSON file store (`path-store`) in the plugin folder. All access to Obsidian's undocumented canvas objects goes through one module (`canvas-internals`) that returns a narrow `LiveCanvas` or `null`. A per-view `CanvasPathController` (an Obsidian `Component`) owns the toolbar button, the `Highlighter` (CSS classes + a `MutationObserver`), and the tap-to-toggle `EditMode`.

**Tech Stack:** TypeScript (strict), Obsidian plugin API, esbuild, vitest (node environment, `obsidian` aliased to `test/stubs/obsidian.ts`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-24-canvas-path-highlight-design.md`

## Global Constraints

- Never write to the `.canvas` file or mutate canvas node/edge data. Highlighting is CSS classes on DOM elements only.
- Path data is never stored in `data.json`. One file per canvas at `<plugin.manifest.dir>/paths/<key>.json`, written via `app.vault.adapter`.
- Every edit re-reads that canvas's file before writing.
- Nothing may depend on shift-click, hover, or right-click. Everything works by tap.
- Accent color is `var(--interactive-accent)`. Off-path edges about 15% opacity, off-path nodes about 30%.
- No `el.style.foo = ...` (lint rule `obsidianmd/no-static-styles-assignment`). Styles go in `styles.css`.
- UI strings in sentence case. Wrap `.canvas`-style tokens in backticks.
- All listeners/observers registered through `Component.register*` or cleaned up in `onunload`. Plugin unload leaves no classes, buttons, pills, or observers behind.
- Files stay under ~300 lines. `main.ts` gets one new line.
- `manifest.json` stays `isDesktopOnly: false`, `minAppVersion: "1.6.0"`.
- Tabs for indentation, double quotes, matching the existing `src/`.
- If the Task 1 spike finds any required internal capability missing: stop and report to John. No reduced version.
- Commit messages end with `Claude-Session: https://claude.ai/code/session_01JgrwY5YruxJB9McQZNS8u9`.

## Review Focus

1. **Path holding deleted edge ids.** A user deletes an on-path edge. Highlight ignores the missing id, and nodes are only lit by edges that still exist. Pinned in Task 2 (`nodesOnPath`).
2. **Bad path names.** Empty, whitespace-only, or duplicate (case-insensitive) names are rejected with a notice, not saved. Pinned in Task 2 (`checkPathName`).
3. **Canvas renamed while open with a path active.** Paths follow the file, and the next edit lands in the renamed file, not a fresh empty one. Pinned in Task 3 (rename then update test). The controller always reads `view.file.path` at action time (Task 6).
4. **Corrupt or hand-edited path file.** Load treats it as "no paths" and flags it. The first write moves the bad file aside instead of silently destroying it. Pinned in Task 3.
5. **Closing the canvas, switching its file, or unloading the plugin mid-edit-mode.** Pill removed, capture listeners removed, classes cleared. Manual check in Task 7.

---

## File Structure

**Create:**
- `src/live-canvas/path-model.ts`: types and pure transforms on a `CanvasPathSet`, plus `nodesOnPath`.
- `src/live-canvas/path-store.ts`: per-canvas file read/modify/write, rename, delete, file key.
- `src/live-canvas/canvas-internals.ts`: the only file that touches undocumented canvas objects.
- `src/live-canvas/highlighter.ts`: applies and removes highlight classes, re-applies on DOM change.
- `src/live-canvas/edit-mode.ts`: tap-to-toggle, Done pill, Esc.
- `src/live-canvas/controller.ts`: per-view state and the toolbar button and menu.
- `src/live-canvas/index.ts`: `registerLiveCanvas(plugin)`, attaching to views and handling vault events.
- `src/ui/path-name-modal.ts`: name prompt and delete confirmation modals.
- `test/live-canvas/path-model.test.ts`, `test/live-canvas/path-store.test.ts`, `test/live-canvas/canvas-internals.test.ts`
- `docs/superpowers/spikes/2026-10-24-canvas-internals.md`: spike findings.

**Modify:**
- `src/main.ts`: call `registerLiveCanvas(this)` in `onload`.
- `styles.css`: highlight, edit-mode, and pill styles.
- `.gitignore`: add `.superpowers/`.

---

### Task 1: Setup and canvas internals spike

Hands-on with John: the phone half needs his device. Produces facts the later tasks are written against. This task writes no product code.

**Files:**
- Modify: `.gitignore`
- Create: `docs/superpowers/spikes/2026-10-24-canvas-internals.md`

- [ ] **Step 1: Branch, install, ignore mockups**

```bash
cd /Users/johnchristopher/Developer/obsidian-plugins/canvas_tools/main
git checkout -b feat/canvas-path-highlight
npm install
echo ".superpowers/" >> .gitignore
npm test
```
Expected: the install completes and the existing suite passes.

- [ ] **Step 2: Commit the spec, plan, and gitignore**

```bash
git add .gitignore docs/superpowers/specs/2026-10-24-canvas-path-highlight-design.md docs/superpowers/plans/2026-10-24-canvas-path-highlight.md
git commit -m "docs: add canvas path highlight design and plan"
```

- [ ] **Step 3: Probe desktop internals**

In the jcOS vault on desktop, open a canvas with at least 5 edges (two routes sharing an edge). In the dev console, start from `const v = app.workspace.getLeavesOfType("canvas")[0].view; const c = v.canvas;` and record answers to each item below in the spike doc. Record exact property names and a one-line example value for each.

1. `c.edges` and `c.nodes`: are they `Map<string, …>`? For an edge, record the id field, how to get from/to node ids (`e.from.node.id`?), and every DOM element that draws it: line path, interaction/hit path, arrowheads, label. For a node, record its root element (`nodeEl`?).
2. Off-screen culling: zoom far in and pan. Are edge and node elements removed from the DOM or only hidden? Which container holds edge SVG and which holds nodes? Record the selector to `MutationObserver`.
3. Edge click path: which element receives `pointerdown` and `click` on an edge? Does the edge element hold a back-reference to the edge object? If not, record how to map a target element to an edge id, e.g. by identity against the elements from item 1. Does a capture-phase `pointerdown` listener on `c.wrapperEl` with `stopImmediatePropagation()` prevent Obsidian from selecting the edge? Does `click` still fire afterward?
4. Interaction path stroke width: is there already a wide invisible hit path? Record its stroke width.
5. Control bar: record the selector for the right-hand control stack and the markup and classes of one existing button, so a new button can match it.
6. Edge color: record how a colored edge sets its stroke (attribute, CSS var such as `--canvas-color`, or class). The highlight's accent must override it.
7. Does `v.file` change in place when the same leaf opens a different canvas? Record what event fires.

- [ ] **Step 4: Probe mobile with John**

On John's phone, open the same canvas, synced, and use the mobile app's dev tools if available, or have John report by eye. Confirm items 3, 4, and 5: the control bar exists, a tap on an edge reaches the same element, and the hit target is tappable with a finger. If the phone can't be inspected, record what was checked by eye only.

- [ ] **Step 5: Gate**

If any of items 1, 2, 3, or 5 is impossible, meaning no per-edge elements, no way to map a tap to an edge, no way to stop Obsidian's edge handling, or no control bar: stop. Report the findings to John and do not continue to Task 2.

- [ ] **Step 6: Commit findings**

```bash
git add docs/superpowers/spikes/2026-10-24-canvas-internals.md
git commit -m "docs: record canvas internals spike findings"
```

---

### Task 2: Path model

**Files:**
- Create: `src/live-canvas/path-model.ts`
- Test: `test/live-canvas/path-model.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CanvasPath { id: string; name: string; edgeIds: string[] }
  export interface CanvasPathSet { version: 1; canvasPath: string; paths: CanvasPath[] }
  export type NameCheck = { ok: true; name: string } | { ok: false; reason: "empty" | "duplicate" };
  export interface EdgeEnds { id: string; fromNode: string; toNode: string }

  export function emptyPathSet(canvasPath: string): CanvasPathSet;
  export function checkPathName(set: CanvasPathSet, name: string, exceptId?: string): NameCheck;
  export function addPath(set: CanvasPathSet, id: string, name: string): CanvasPathSet;
  export function renamePath(set: CanvasPathSet, id: string, name: string): CanvasPathSet;
  export function deletePath(set: CanvasPathSet, id: string): CanvasPathSet;
  export function toggleEdge(set: CanvasPathSet, pathId: string, edgeId: string): CanvasPathSet;
  export function findPath(set: CanvasPathSet, id: string): CanvasPath | undefined;
  export function parsePathSet(raw: string, canvasPath: string): CanvasPathSet | null;
  export function nodesOnPath(edges: Iterable<EdgeEnds>, edgeIds: ReadonlySet<string>): Set<string>;
  ```
  All transforms are immutable and return a new set. Unknown ids return the set unchanged. `addPath` and `renamePath` trust that the caller ran `checkPathName` and store the trimmed name.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { addPath, checkPathName, deletePath, emptyPathSet, nodesOnPath, parsePathSet, renamePath, toggleEdge } from "../../src/live-canvas/path-model";

const base = () => addPath(addPath(emptyPathSet("Maps/flow.canvas"), "p1", "Route A"), "p2", "Route B");

describe("checkPathName", () => {
	it("trims and accepts a new name", () => {
		expect(checkPathName(base(), "  Route C ")).toEqual({ ok: true, name: "Route C" });
	});
	it("rejects empty and whitespace-only names", () => {
		expect(checkPathName(base(), "   ")).toEqual({ ok: false, reason: "empty" });
	});
	it("rejects duplicates case-insensitively", () => {
		expect(checkPathName(base(), "route a")).toEqual({ ok: false, reason: "duplicate" });
	});
	it("allows keeping your own name on rename", () => {
		expect(checkPathName(base(), "Route A", "p1")).toEqual({ ok: true, name: "Route A" });
	});
});

describe("toggleEdge", () => {
	it("adds then removes an edge", () => {
		const on = toggleEdge(base(), "p1", "e1");
		expect(on.paths[0].edgeIds).toEqual(["e1"]);
		expect(toggleEdge(on, "p1", "e1").paths[0].edgeIds).toEqual([]);
	});
	it("lets two paths share an edge", () => {
		const s = toggleEdge(toggleEdge(base(), "p1", "e1"), "p2", "e1");
		expect(s.paths.map((p) => p.edgeIds)).toEqual([["e1"], ["e1"]]);
	});
	it("ignores an unknown path id and does not mutate input", () => {
		const s = base();
		expect(toggleEdge(s, "nope", "e1")).toEqual(s);
		toggleEdge(s, "p1", "e1");
		expect(s.paths[0].edgeIds).toEqual([]);
	});
});

describe("rename and delete", () => {
	it("renames by id", () => {
		expect(renamePath(base(), "p2", "Checkout").paths[1].name).toBe("Checkout");
	});
	it("deletes by id", () => {
		expect(deletePath(base(), "p1").paths.map((p) => p.id)).toEqual(["p2"]);
	});
});

describe("parsePathSet", () => {
	it("round-trips a valid set", () => {
		const s = toggleEdge(base(), "p1", "e1");
		expect(parsePathSet(JSON.stringify(s), "Maps/flow.canvas")).toEqual(s);
	});
	it("uses the given canvas path over the stored one", () => {
		const s = { ...base(), canvasPath: "old.canvas" };
		expect(parsePathSet(JSON.stringify(s), "new.canvas")?.canvasPath).toBe("new.canvas");
	});
	it("returns null for invalid JSON or the wrong shape", () => {
		expect(parsePathSet("{not json", "a.canvas")).toBeNull();
		expect(parsePathSet(JSON.stringify({ paths: [{ id: 1 }] }), "a.canvas")).toBeNull();
		expect(parsePathSet(JSON.stringify({ version: 2, paths: [] }), "a.canvas")).toBeNull();
	});
});

describe("nodesOnPath", () => {
	const edges = [
		{ id: "e1", fromNode: "start", toNode: "login" },
		{ id: "e2", fromNode: "login", toNode: "dash" },
		{ id: "e3", fromNode: "login", toNode: "checkout" },
	];
	it("collects both ends of on-path edges", () => {
		expect(nodesOnPath(edges, new Set(["e1", "e2"]))).toEqual(new Set(["start", "login", "dash"]));
	});
	it("ignores path edge ids that no longer exist", () => {
		expect(nodesOnPath(edges, new Set(["e1", "deleted"]))).toEqual(new Set(["start", "login"]));
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/live-canvas/path-model.test.ts`
Expected: FAIL, cannot resolve `../../src/live-canvas/path-model`.

- [ ] **Step 3: Implement `src/live-canvas/path-model.ts`**

Implement the interfaces above. `parsePathSet` requires `version === 1` and requires every path to have string `id`, string `name`, and `edgeIds` as an array of strings. Anything else returns `null`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/live-canvas/path-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/live-canvas/path-model.ts test/live-canvas/path-model.test.ts
git commit -m "feat: add canvas path model"
```

---

### Task 3: Path store

**Files:**
- Create: `src/live-canvas/path-store.ts`
- Test: `test/live-canvas/path-store.test.ts`

**Interfaces:**
- Consumes: `CanvasPathSet`, `emptyPathSet`, `parsePathSet` (Task 2); `safeFileSlug` (`src/utils/ids.ts`).
- Produces:
  ```ts
  // Subset of Obsidian's DataAdapter, so `app.vault.adapter` passes directly.
  export interface PathFileAdapter {
  	exists(path: string): Promise<boolean>;
  	read(path: string): Promise<string>;
  	write(path: string, data: string): Promise<void>;
  	remove(path: string): Promise<void>;
  	rename(from: string, to: string): Promise<void>;
  	mkdir(path: string): Promise<void>;
  }
  export interface LoadResult { set: CanvasPathSet; corrupt: boolean }
  export function pathFileKey(canvasPath: string): string;
  export class PathStore {
  	constructor(adapter: PathFileAdapter, dir: string);
  	load(canvasPath: string): Promise<LoadResult>;
  	update(canvasPath: string, change: (set: CanvasPathSet) => CanvasPathSet): Promise<CanvasPathSet>;
  	renameCanvas(oldPath: string, newPath: string): Promise<void>;
  	deleteCanvas(canvasPath: string): Promise<void>;
  }
  ```
- Behavior:
  - `pathFileKey` returns `safeFileSlug(basename)` + `-` + an 8-hex-char FNV-1a hash of the full vault path. It's readable and unique across folders.
  - The store keeps no cache. Every `load` and `update` reads the file.
  - `update` creates `dir` if it's missing. On a corrupt file, it first renames it to `<key>.corrupt-<Date.now()>.json`, then applies `change` to an empty set.
  - `renameCanvas` writes the set under the new key with `canvasPath` updated, then removes the old file. It's a no-op if no old file exists. It overwrites an existing target.

- [ ] **Step 1: Write the failing tests**

Use an in-memory adapter defined in the test file: a `Map<string, string>` implementing `PathFileAdapter`, where `mkdir` records the dir.

```ts
describe("pathFileKey", () => {
	it("is stable and readable", () => {
		expect(pathFileKey("Maps/User Flow.canvas")).toBe(pathFileKey("Maps/User Flow.canvas"));
		expect(pathFileKey("Maps/User Flow.canvas")).toMatch(/^user-flow-[0-9a-f]{8}$/);
	});
	it("differs for the same name in different folders", () => {
		expect(pathFileKey("a/flow.canvas")).not.toBe(pathFileKey("b/flow.canvas"));
	});
});

describe("PathStore", () => {
	const DIR = ".obsidian/plugins/canvas-tools/paths";

	it("loads an empty set when no file exists", async () => {
		const { set, corrupt } = await new PathStore(memAdapter(), DIR).load("flow.canvas");
		expect(set).toEqual(emptyPathSet("flow.canvas"));
		expect(corrupt).toBe(false);
	});

	it("persists an update and creates the dir", async () => {
		const fs = memAdapter();
		const store = new PathStore(fs, DIR);
		await store.update("flow.canvas", (s) => addPath(s, "p1", "Route A"));
		expect(fs.dirs).toContain(DIR);
		expect((await store.load("flow.canvas")).set.paths[0].name).toBe("Route A");
	});

	it("re-reads before writing, keeping another machine's change", async () => {
		const fs = memAdapter();
		const mine = new PathStore(fs, DIR);
		const theirs = new PathStore(fs, DIR);
		await mine.update("flow.canvas", (s) => addPath(s, "p1", "Route A"));
		await theirs.update("flow.canvas", (s) => addPath(s, "p2", "Route B"));
		await mine.update("flow.canvas", (s) => toggleEdge(s, "p1", "e1"));
		const { set } = await mine.load("flow.canvas");
		expect(set.paths.map((p) => p.name)).toEqual(["Route A", "Route B"]);
		expect(set.paths[0].edgeIds).toEqual(["e1"]);
	});

	it("keeps canvases in separate files", async () => {
		const fs = memAdapter();
		const store = new PathStore(fs, DIR);
		await store.update("x.canvas", (s) => addPath(s, "p1", "X"));
		await store.update("y.canvas", (s) => addPath(s, "p1", "Y"));
		expect([...fs.files.keys()].filter((k) => k.startsWith(DIR))).toHaveLength(2);
	});

	it("flags a corrupt file and moves it aside on first write", async () => {
		const fs = memAdapter();
		fs.files.set(`${DIR}/${pathFileKey("flow.canvas")}.json`, "{oops");
		const store = new PathStore(fs, DIR);
		expect((await store.load("flow.canvas")).corrupt).toBe(true);
		await store.update("flow.canvas", (s) => addPath(s, "p1", "Route A"));
		expect([...fs.files.keys()].some((k) => k.includes(".corrupt-"))).toBe(true);
		expect((await store.load("flow.canvas")).corrupt).toBe(false);
	});

	it("follows a rename, and later edits land in the new file", async () => {
		const fs = memAdapter();
		const store = new PathStore(fs, DIR);
		await store.update("old.canvas", (s) => addPath(s, "p1", "Route A"));
		await store.renameCanvas("old.canvas", "new.canvas");
		await store.update("new.canvas", (s) => toggleEdge(s, "p1", "e1"));
		const { set } = await store.load("new.canvas");
		expect(set.canvasPath).toBe("new.canvas");
		expect(set.paths[0].edgeIds).toEqual(["e1"]);
		expect((await store.load("old.canvas")).set.paths).toEqual([]);
	});

	it("deletes a canvas's file", async () => {
		const fs = memAdapter();
		const store = new PathStore(fs, DIR);
		await store.update("flow.canvas", (s) => addPath(s, "p1", "Route A"));
		await store.deleteCanvas("flow.canvas");
		expect((await store.load("flow.canvas")).set.paths).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/live-canvas/path-store.test.ts`
Expected: FAIL, cannot resolve `../../src/live-canvas/path-store`.

- [ ] **Step 3: Implement `src/live-canvas/path-store.ts`**

Implement the interfaces and behavior above. Write JSON with tab indentation.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/live-canvas/path-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/live-canvas/path-store.ts test/live-canvas/path-store.test.ts
git commit -m "feat: add per-canvas path file store"
```

---

### Task 4: Canvas internals adapter

Written against the spike doc from Task 1. Property names in the fake fixture and the implementation come from that doc, not from this plan.

**Files:**
- Create: `src/live-canvas/canvas-internals.ts`
- Test: `test/live-canvas/canvas-internals.test.ts`

**Interfaces:**
- Consumes: `EdgeEnds` (Task 2).
- Produces:
  ```ts
  export interface LiveEdge extends EdgeEnds { els: Element[] }   // line, hit path, arrowheads, label
  export interface LiveNode { id: string; el: HTMLElement }
  export interface LiveCanvas {
  	root: HTMLElement;              // element to attach capture listeners and the edit pill to
  	observeEl: HTMLElement;         // element whose subtree changes when edges/nodes render
  	controlsEl: HTMLElement | null; // right-hand control stack
  	edges(): LiveEdge[];
  	nodes(): LiveNode[];
  	edgeFromTarget(target: EventTarget | null): LiveEdge | null;
  }
  export function getLiveCanvas(view: unknown): LiveCanvas | null;
  export const CONTROL_BUTTON_CLASS: string; // class(es) on an existing control button, from the spike
  ```
- `getLiveCanvas` duck-types every property it reads and returns `null` if any is missing or the wrong type. It never throws. `edges()`, `nodes()`, and `edgeFromTarget()` read live on every call, with no caching.

- [ ] **Step 1: Write the failing tests**

Build `fakeView()` in the test file using the exact shape recorded in the spike doc. Use plain objects for the canvas, and minimal `{}` objects cast to `Element` for the DOM, since the environment is node.

```ts
describe("getLiveCanvas", () => {
	it("returns null for things that are not canvas views", () => {
		expect(getLiveCanvas(null)).toBeNull();
		expect(getLiveCanvas({})).toBeNull();
		expect(getLiveCanvas({ canvas: {} })).toBeNull();
		expect(getLiveCanvas({ canvas: { edges: [], nodes: new Map() } })).toBeNull(); // wrong type
	});
	it("maps edges to ids, end node ids, and elements", () => {
		const live = getLiveCanvas(fakeView())!;
		expect(live.edges().map(({ id, fromNode, toNode }) => ({ id, fromNode, toNode }))).toEqual([
			{ id: "e1", fromNode: "a", toNode: "b" },
		]);
		expect(live.edges()[0].els.length).toBeGreaterThan(0);
	});
	it("reads edges live, not from a snapshot", () => {
		const view = fakeView();
		const live = getLiveCanvas(view)!;
		addFakeEdge(view, "e2", "b", "a");
		expect(live.edges()).toHaveLength(2);
	});
	it("finds the edge for one of its elements, and null otherwise", () => {
		const live = getLiveCanvas(fakeView())!;
		expect(live.edgeFromTarget(live.edges()[0].els[0])?.id).toBe("e1");
		expect(live.edgeFromTarget(null)).toBeNull();
	});
});
```
If the spike found that target-to-edge mapping needs DOM traversal (`closest`, `contains`), give the fake elements the methods the implementation uses.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/live-canvas/canvas-internals.test.ts`
Expected: FAIL, the module is missing.

- [ ] **Step 3: Implement `src/live-canvas/canvas-internals.ts`**

Keep the raw shapes in local, non-exported interfaces with every field optional. The rest of the codebase sees only `LiveCanvas`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/live-canvas/canvas-internals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/live-canvas/canvas-internals.ts test/live-canvas/canvas-internals.test.ts
git commit -m "feat: add live canvas internals adapter"
```

---

### Task 5: Highlighter and edit mode

DOM-bound. Checked by build, lint, and the manual checks in Task 7.

**Files:**
- Create: `src/live-canvas/highlighter.ts`, `src/live-canvas/edit-mode.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `LiveCanvas` (Task 4); `nodesOnPath` (Task 2).
- Produces:
  ```ts
  // highlighter.ts
  export class Highlighter extends Component {
  	constructor(canvas: LiveCanvas);
  	show(edgeIds: ReadonlySet<string>): void;   // replaces any current highlight
  	clear(): void;
  }
  // edit-mode.ts
  export class EditMode extends Component {
  	constructor(canvas: LiveCanvas, pathName: string, onToggle: (edgeId: string) => void, onDone: () => void);
  }
  ```
- CSS classes:
  - `ct-path-active` on `canvas.root` while showing.
  - `ct-path-edge-on` or `ct-path-edge-off` on every element in each edge's `els`.
  - `ct-path-node-on` or `ct-path-node-off` on each node's `el`.
  - `ct-path-editing` on `canvas.root` during edit mode.

- [ ] **Step 1: Implement `Highlighter`**

- `show` stores the id set and runs `apply()`. `apply()` sets the classes on every current edge and node, using `nodesOnPath(canvas.edges(), ids)` for the nodes.
- In `onload`, create a `MutationObserver` on `canvas.observeEl` (`childList: true, subtree: true`, no attributes) that schedules `apply()` once per animation frame. Disconnect it and cancel any pending frame in `onunload`.
- `clear()` and `onunload` remove all four classes and `ct-path-active` from current elements.

- [ ] **Step 2: Implement `EditMode`**

- In `onload`:
  - Add `ct-path-editing` to the root.
  - Create the pill with `canvas.root.createDiv({ cls: "ct-path-edit-pill" })`. It reads `Editing ${pathName}` and has a **Done** button that calls `onDone`.
  - Register capture-phase listeners on `canvas.root`: `pointerdown`, `mousedown`, and `click`.
  - In each listener, if `canvas.edgeFromTarget(evt.target)` returns an edge, call `preventDefault()` and `stopImmediatePropagation()`. On `click`, also call `onToggle(edge.id)`.
  - Register `keydown` on `window`: Esc calls `onDone`.
- In `onunload`, remove the pill and the class. Listeners clean up through `registerDomEvent`.
- Adjust which events need blocking to match the spike's item 3 findings.

- [ ] **Step 3: Add styles to `styles.css`**

- `.ct-path-edge-off`: opacity 0.15.
- `.ct-path-node-off`: opacity 0.3.
- `.ct-path-edge-on`: stroke `var(--interactive-accent)` (and fill, for arrowheads), with a wider line. It must beat the edge's own color, using the mechanism from spike item 6.
- `.ct-path-node-on`: border or outline in `var(--interactive-accent)`.
- `.ct-path-editing` hit paths: widen the stroke (using the selector from spike item 4) to at least 24px so a finger can hit it.
- `.ct-path-edit-pill`: absolute, top center, above the canvas. Use theme variables for the background, text, and border. Button styled like Obsidian's `mod-cta`.
- Every rule is scoped so it applies only while the classes are present.

- [ ] **Step 4: Build and lint**

Run: `npm run build && npm run lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/live-canvas/highlighter.ts src/live-canvas/edit-mode.ts styles.css
git commit -m "feat: add path highlighter and tap-to-toggle edit mode"
```

---

### Task 6: Controller, toolbar menu, and wiring

**Files:**
- Create: `src/live-canvas/controller.ts`, `src/live-canvas/index.ts`, `src/ui/path-name-modal.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 5; `shortId` (`src/utils/ids.ts`).
- Produces:
  ```ts
  // path-name-modal.ts
  export function promptPathName(app: App, title: string, initial: string, validate: (name: string) => NameCheck): Promise<string | null>;
  export function confirmDelete(app: App, pathName: string): Promise<boolean>;
  // controller.ts
  export class CanvasPathController extends Component {
  	constructor(app: App, view: View & { file: TFile | null }, canvas: LiveCanvas, store: PathStore);
  	readonly filePath: string | null;   // the file this controller was built for
  }
  // index.ts
  export function registerLiveCanvas(plugin: Plugin): void;
  ```
- Copy, exact:
  - Button aria-label: `Paths`. Icon: `route`.
  - Menu items: **Show all edges**, one item per path name (checked when active), **Edit edges of active path**, **New path…**, **Rename active path…**, **Delete active path…**
  - Modal titles: `New path`, `Rename path`. Delete confirmation: `Delete path "${name}"?`
  - Notices: `Path name can't be empty.`, `A path with that name already exists.`, `Couldn't read saved paths for this canvas. Starting fresh.`

- [ ] **Step 1: Implement the modals in `src/ui/path-name-modal.ts`**

`promptPathName` shows an input and a **Save** button. Enter submits. On submit it runs `validate`, shows the matching notice and keeps the modal open on failure, and resolves the trimmed name on success. Closing resolves `null`. `confirmDelete` has **Delete** (`mod-warning`) and **Cancel** buttons.

- [ ] **Step 2: Implement `CanvasPathController`**

- In `onload`:
  - Add a `Highlighter` child.
  - Add the button to `canvas.controlsEl`, matching `CONTROL_BUTTON_CLASS` and using `setIcon`. If `controlsEl` is `null`, the controller does nothing.
  - Load the store once. If the file is corrupt, show the notice.
- In `onunload`, remove the button. Child components clean up on their own.
- **On button click:** reload the store (`load(view.file.path)`) so remote edits show, then show an Obsidian `Menu` at the button.
- **Selecting a path:** set it active, call `highlighter.show(new Set(path.edgeIds))`, and add `is-active` to the button. Selecting the active path again, or **Show all edges**, clears all three.
- **Edit edges:** add an `EditMode` child. `onToggle` runs `store.update(path, (s) => toggleEdge(s, activeId, edgeId))`, then `highlighter.show()` with that path's new edge ids. `onDone` removes the child.
- **New path:** call `promptPathName` (validate with `checkPathName`), then `store.update` with `addPath(s, shortId("path"), name)`. Make the new path active and start editing.
- **Rename and delete:** act on the active path. They're disabled with no active path. Deleting the active path clears the highlight.
- **Every store call** uses `view.file.path` at call time, never a cached path. Every store call is wrapped in try/catch, and failures show a notice.
- Only one `EditMode` at a time. Switching paths ends edit mode first.

- [ ] **Step 3: Implement `registerLiveCanvas` in `src/live-canvas/index.ts`**

- Create `new PathStore(plugin.app.vault.adapter, \`${plugin.manifest.dir}/paths\`)`.
- Track controllers in a `Map<View, CanvasPathController>`.
- `sync()`:
  - For each leaf of type `canvas` without a controller, call `getLiveCanvas(view)`. On `null`, log one `console.warn` per session and skip. Otherwise add the controller as a child of the plugin.
  - Remove the controller (`plugin.removeChild`) for views that are gone, or whose `view.file?.path !== controller.filePath`. A replacement is created on the same pass.
- Run `sync()` from `workspace.onLayoutReady`, `layout-change`, and `file-open`.
- Register vault `rename` (`TFile` with extension `canvas` → `store.renameCanvas(oldPath, file.path)`) and `delete` (→ `store.deleteCanvas(file.path)`). Errors go to `console.error`.

- [ ] **Step 4: Wire `src/main.ts`**

Add `registerLiveCanvas(this);` after `registerCommands(this);`.

- [ ] **Step 5: Test, build, and lint**

Run: `npm test && npm run build && npm run lint`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/live-canvas/controller.ts src/live-canvas/index.ts src/ui/path-name-modal.ts src/main.ts
git commit -m "feat: add canvas paths toolbar button and wiring"
```

---

### Task 7: Install and verify by hand

Ask John before copying into the vault, because it overwrites the installed plugin files.

- [ ] **Step 1: Install**

```bash
cp main.js manifest.json styles.css ~/Obsidian/jcOS/.obsidian/plugins/canvas-tools/
shasum ~/Obsidian/jcOS/<test canvas>.canvas > /tmp/before.sha
```
Then reload the plugin in Obsidian.

- [ ] **Step 2: Desktop checklist**

Use a canvas with two routes that share an edge. Each item passes or fails:
1. The **Paths** button appears in the control bar of an already-open canvas and of a newly opened one.
2. **New path…** prompts for a name and enters edit mode. Tapping edges toggles them, and on-path edges brighten immediately. **Done** and Esc both exit.
3. An empty name or a duplicate name shows its notice and saves nothing.
4. Switching Route A and Route B moves the highlight. The shared edge is lit in both. Off-path nodes and edges are dimmed but still readable. **Show all edges** restores everything.
5. While highlighted: pan, zoom, and add an edge (it appears dimmed). Delete an on-path edge (it drops out, and its now-orphaned node dims). Undo (the edge returns lit).
6. Rename the canvas file while Route A is active, then toggle an edge. Reopen the canvas, and the path is intact under the new name.
7. Hand-corrupt the path file, reopen the canvas, and confirm the notice shows and nothing crashes.
8. Close the canvas mid-edit-mode, and also disable the plugin mid-edit-mode. Confirm there's no pill, no leftover classes (check in the console: `document.querySelectorAll("[class*=ct-path]").length === 0`), and no errors.
9. `shasum -c /tmp/before.sha` confirms the `.canvas` file is unchanged after a session of highlighting only (no edits).

- [ ] **Step 3: Phone and sync checklist, with John**

1. Repeat items 1, 2, and 4 on the phone. Edges toggle with a normal finger tap, and the menu and pill are usable.
2. Edit paths on canvas X on one machine and canvas Y on another. Once sync settles, confirm both survive on both machines.
3. Create a path on the phone, then open the menu on desktop and confirm it shows up without restarting.

- [ ] **Step 4: Record results**

Append a "Verification" section to the spike doc with pass or fail for each item, then commit.

```bash
git add docs/superpowers/spikes/2026-10-24-canvas-internals.md
git commit -m "docs: record canvas path highlight verification"
```

---

### Task 8: Store paths in the canvas file (spec revision 2026-10-24)

Obsidian Sync never syncs files in plugin subfolders, so `<plugin dir>/paths/*.json` never reached other machines. John chose to store paths inside the `.canvas` file instead. See the spec's Data section. This task replaces Task 3's store.

**Files:**
- Delete: `src/live-canvas/path-store.ts`, `test/live-canvas/path-store.test.ts`
- Modify: `src/live-canvas/path-model.ts`, `test/live-canvas/path-model.test.ts`, `src/live-canvas/canvas-internals.ts`, `test/live-canvas/canvas-internals.test.ts`, `src/live-canvas/controller.ts`, `src/live-canvas/index.ts`

**Interfaces:**
- `path-model.ts` changes:
  ```ts
  export const PATHS_KEY = "canvasToolsPaths";
  export const CORRUPT_KEY = "canvasToolsPathsCorrupt";
  export interface CanvasPathSet { version: 1; paths: CanvasPath[] }      // canvasPath removed
  export function emptyPathSet(): CanvasPathSet;
  export function parsePathSet(value: unknown): CanvasPathSet | null;      // takes the parsed value, not a string
  export interface ReadResult { set: CanvasPathSet; corrupt: boolean }
  export function readPathSet(canvasData: unknown): ReadResult;            // missing key → empty, not corrupt
  export function pathSetPatch(canvasData: unknown, set: CanvasPathSet): Record<string, unknown>;
  // returns { [PATHS_KEY]: set }, plus { [CORRUPT_KEY]: <old value> } when the current value is corrupt
  ```
- `LiveCanvas` gains:
  ```ts
  readData(): unknown;                                // canvas.data, read live; its identity changes on every save, undo, and reload
  writeData(patch: Record<string, unknown>): void;    // Object.assign(canvas.data, patch); canvas.requestSave(true)
  isReadonly(): boolean;                              // canvas.readonly
  ```
  `getLiveCanvas` returns `null` when `canvas.data` isn't an object or `canvas.requestSave` isn't a function.
- The controller drops `PathStore` and the write queue. It reads the set live (`readPathSet(canvas.readData())`), and writes with `canvas.writeData(pathSetPatch(...))`. A `registerInterval` (300ms) compares `canvas.readData()` identity to the last value it saw, and calls `showActive()` on change. That covers undo, redo, and sync reloads. Edit actions are disabled while `canvas.isReadonly()`.
- `index.ts` drops the store and the vault `delete` handler. The `rename` handler only retargets controllers.

- [ ] **Step 1:** Rewrite the model tests for the new `emptyPathSet`/`parsePathSet` signatures, and add:
  - `readPathSet` with the key missing, valid, and corrupt
  - `pathSetPatch` returns only the plugin keys
  - a corrupt value is moved to `CORRUPT_KEY`

  Run them and watch them fail.
- [ ] **Step 2:** Implement, and watch the tests pass.
- [ ] **Step 3:** Add internals tests: `readData` and `writeData` (patch assigned, `requestSave` called with `true`), `isReadonly`, and `null` when `data` or `requestSave` is missing. Watch them fail, implement, and watch them pass.
- [ ] **Step 4:** Rework the controller and `index.ts`, delete the store files, then run `npx vitest run && npm run build && npm run lint`, all exit 0.
- [ ] **Step 5:** Commit. Reinstall into the vault and re-run the Task 7 desktop checklist, plus:
  - a diff after path edits shows only `canvasToolsPaths` changed
  - Cmd+Z undoes a toggle
  - a highlight-only session leaves the file byte-identical
