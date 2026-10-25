# Canvas internals spike — 2026-10-24

Probed Obsidian 1.15.0 (desktop, macOS) through the Obsidian CLI's `eval` against a live canvas (`Shift2/Shepherd Factory Lifecycle.canvas`, 50 nodes, 39 edges), and read the canvas source in `obsidian-1.15.0.asar`. Starting point: `const v = app.workspace.getLeavesOfType("canvas")[0].view; const c = v.canvas;`

## 1. Edges and nodes

- `c.edges: Map<string, Edge>`, `c.nodes: Map<string, Node>`.
- Edge: `e.id` (e.g. `"you_triage-receiver-0"`), `e.from.node.id`, `e.to.node.id` (`from`/`to` are `{ node, side, end }`).
- Edge DOM:
  - `e.lineGroupEl`: `<g>` inside `svg.canvas-edges`. Holds `path.canvas-interaction-path` (`e.path.interaction`) and `path.canvas-display-path` (`e.path.display`).
  - `e.lineEndGroupEl`: `<g>` inside the second `svg.canvas-edges` (`c.edgeEndContainerEl`). Holds arrowhead `<g><polygon class="canvas-path-end">`. These arrowhead children are recreated when the end type changes.
  - `e.labelElement?.wrapperEl`: `div.canvas-path-label-wrapper` inside `div.canvas`. Created lazily, and destroyed when the label is cleared.
- Node: `n.id`, root `n.nodeEl` (`div.canvas-node`), appended into `div.canvas`.

## 2. Culling and containers

- Off-screen edges and nodes are **detached** from the DOM, not hidden (28/39 edges, 33/50 nodes attached at the time). `attach()` re-appends the **same** elements, so classes set on them survive culling.
- Every edge container, label, and node lives under `c.canvasEl` (`div.canvas`). **Observe `c.canvasEl`** with `childList + subtree`.
- No code path assigns `className` on `nodeEl`, `lineGroupEl`, or `wrapperEl`. Obsidian only uses `classList` operations (`ku()` for colors, `toggleClass("is-themed")`), so our classes are safe.

## 3. Edge click path

- Edge listeners are registered on `e.lineGroupEl` in `Edge.initialize()`: `click → onClick`, `contextmenu`, `pointerdown → onConnectionPointerdown`. The label wrapper has its own `click` handler.
- There's no back-reference from element to edge. Map a target by identity: walk `c.edges` and test `lineGroupEl.contains(target) || labelElement?.wrapperEl.contains(target)`.
- `c.wrapperEl` (`div.canvas-wrapper`) is an ancestor of all of it. A capture-phase listener there with `stopImmediatePropagation()` runs before the target's handlers and stops them. Not intercepting `pointerdown` leaves Obsidian's `click` path intact. In edit mode, block `pointerdown`, `click`, `dblclick`, and `contextmenu` on edge targets, and toggle on `click`. Blocking `pointerdown` doesn't cancel the later `click` event (pointer events spec).

## 4. Hit target

- `path.canvas-interaction-path` already has `stroke-width: calc(24px * var(--zoom-multiplier))` and `pointer-events: stroke`, with a transparent stroke. Edit mode can widen it further.

## 5. Control bar

- `c.canvasControlsEl` = `div.canvas-controls`, a child of `c.wrapperEl`. Groups are `div.canvas-control-group.mod-raised` (desktop: [settings], [zoom ×4], [undo, redo], [help]).
- Button markup: `<div class="canvas-control-item" aria-label="…" data-tooltip-position="left"><svg class="svg-icon lucide-…"/></div>`.
- New button: its own `canvas-control-group mod-raised` containing one `canvas-control-item`.

## 6. Edge color

- `.canvas-edges path.canvas-display-path { stroke: var(--canvas-color) }`. Preset colors set `mod-canvas-color-N` on the `<g>`. Custom colors set an inline `--canvas-color` property on the `<g>`.
- Override with a more specific selector on `stroke` itself, e.g. `.canvas-edges g.ct-path-edge-on path.canvas-display-path`. No `!important` is needed, because inline style only sets the variable.

## 7. File switch

- The view is a `FileView`. Opening another canvas in the same leaf keeps the same `view` and `view.canvas` objects, changes `v.file`, and fires `file-open`.

## Mobile

- Not probed. No phone is reachable from this session. The source shows touch-aware branches in the same handlers (`pointerType === "touch"` in `onConnectionPointerdown`), so the same listener path should apply. The phone checks are in Task 7, step 3.

## Gate

Items 1, 2, 3, and 5 are all possible on desktop. Proceed.
