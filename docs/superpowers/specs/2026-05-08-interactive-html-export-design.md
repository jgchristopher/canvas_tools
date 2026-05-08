# Interactive HTML export — Design

## Context

The current HTML export is a static snapshot. After publishing, the only way to change the layout is to re-edit the source `.canvas` in Obsidian and re-export. That breaks the workflow of "tweak the layout for a screenshot" or "reflow before embedding in a slide" — small ergonomic tasks that don't justify a full round-trip through the source vault.

This design adds **ephemeral, in-browser move and resize** to the exported HTML. State lives only in the browser; reload returns to the original layout. Connected edges follow nodes as they move. The feature is opt-in via a setting (default on) so users who want a pure view-only export can keep that.

Out of scope: multi-select, undo/redo, snap-to-grid, text editing, add/delete nodes, edge drawing, persistence (download or vault write-back). Each could be a follow-up; deferring them keeps this change focused.

## Interaction model

Layered on top of the existing pan/zoom runtime, with no mode toggle:

| Action | Result |
|---|---|
| Drag empty space | Pan (unchanged) |
| Drag node body | Move that node; connected edges follow live |
| Drag a node's resize handle (8 grippers, 4 corners + 4 sides) | Resize from that anchor; opposite anchor stays fixed; edges follow |
| Click link inside a node | Navigate (unchanged) |
| Click toolbar **Reset** button | Restore all nodes to export-time positions/sizes |
| Wheel / pinch | Zoom (unchanged) |

Click-vs-drag is disambiguated by a 3px movement threshold. Mouse-up before the threshold is a click and links resolve normally. This is the same pattern Figma/Excalidraw/tldraw use — it removes the need for a tool palette while keeping link clicks working.

## Architecture

**State sidecar in the HTML.** The renderer adds a `<script type="application/json" id="ct-state">{ ... }</script>` block alongside the existing inline-positioned nodes and edge SVG. Shape:

```json
{
  "nodes": [{ "id": "a", "x": 0, "y": 0, "w": 200, "h": 100 }, ...],
  "edges": [{ "id": "e1", "from": { "node": "a", "side": "right" },
              "to": { "node": "b", "side": "left" },
              "label": "...", "color": "...", "toEnd": "arrow", "fromEnd": "none" }, ...],
  "bounds": { "x": 0, "y": 0, "w": 1200, "h": 800 }
}
```

Runtime parses it on `DOMContentLoaded`, snapshots it as the "original" for reset, then wires event listeners. Every interaction mutates both the in-memory state and the corresponding DOM elements directly. No virtual DOM, no diff loop.

**Edge updater is the central coordination point.** When a node moves or resizes, only the edges connected to that node need their SVG path `d` attribute and their label position recomputed. The runtime keeps a `Map<nodeId, edgeId[]>` index built once at hydration. During drag, an `requestAnimationFrame`-batched updater recomputes paths for the affected edges only. The path geometry uses the same bezier formulas as the server-side renderer (extracted into a shared helper), so drag-time output matches export-time output exactly.

**No persistence.** Reload returns to the export-time layout. localStorage and URL hashes are explicitly out — they would create silent state divergence between exports.

## Components

Four logical sections inside `runtime.ts`, separated by comment banners (the file remains a single TypeScript template literal because the bundler inlines the runtime as a string):

1. **`hitTest(target, event)`** — returns `pan | move | resize-<corner> | link`. Walks up the DOM from the event target until it finds a node, a handle, or hits the canvas viewport. `<a>` always wins.
2. **`dragManager`** — owns the active drag operation. Tracks origin coords, applies translation each frame, calls `edgeUpdater.update(nodeId)`. Releases on `mouseup` / `touchend`.
3. **`resizeManager`** — same as drag, but mutates `width/height`. The chosen handle determines which side stays fixed. Minimum size 40x40 to avoid zero-area nodes.
4. **`edgeUpdater`** — pure given current state + a set of node ids: rewrites the `path.d` for each affected edge, repositions the `<text>` label to the new bezier midpoint. Reused by both managers and by **Reset**.

## Data flow

```
.canvas  ─►  CanvasModel  ─►  HtmlEmitter
                                   │
                                   ├─► HTML body (static, today)
                                   ├─► state sidecar JSON  (new)
                                   └─► runtime.js (hydrates sidecar, wires interactions)
```

The CanvasModel and emitter chain is unchanged. The HTML emitter gains responsibility for writing the state sidecar and for emitting node `data-id` plus the 8 resize handles per node. The Excalidraw emitter is untouched.

## Files

Modify:
- `src/emit/html/renderer.ts` — emit state sidecar; add `data-id` to edge `<path>` and label `<text>` elements; emit 8 resize handle divs inside each node
- `src/emit/html/runtime.ts` — grow from ~150 lines to ~450; add hit testing, drag/resize managers, edge updater, reset
- `src/emit/html/styles.ts` — resize handle visuals (8 grippers, hover-only by default), cursor changes per region, reset button
- `src/settings.ts` — add `htmlInteractive: boolean` (default `true`)
- `src/settings-tab.ts` — surface the toggle
- `src/ui/export-modal.ts` — surface the toggle per-export
- `src/emit/html/emitter.ts` + `package-folder.ts` + `package-single.ts` — pass through the interactivity flag; renderer skips the state sidecar and the runtime omits drag/resize sections when off

New:
- `src/emit/html/edge-geometry.ts` — extract the bezier path computation from the existing renderer so both server-side render and client-side updates use the exact same math
- `test/emit/html/edge-geometry.test.ts` — unit tests for the extracted function (anchor positions, control point offsets, midpoint calculation)
- `test/emit/html/state-sidecar.test.ts` — snapshot test asserting the JSON shape the runtime depends on, against the existing `text-only.canvas` fixture

## Settings UX

A single new toggle, sentence-case to satisfy the obsidianmd lint:

> **Interactive HTML output**
> Allow viewers to drag and resize nodes in the exported HTML. Reload restores the original layout.

Default: on. When off, the renderer omits the state sidecar and the runtime ships only pan/zoom — smaller output, no editing affordances.

## Verification

- `npm test` — unit tests for the extracted edge geometry and the state sidecar shape
- `npm run build` — bundle size check (expect ~10–15KB increase, mostly from the runtime additions)
- Manual: export a multi-node, multi-edge canvas. Open the HTML. Drag a node — connected edges follow. Resize from each of the 8 handles in turn. Click a link — navigates correctly. Click a node body without dragging — does not move (3px threshold respected). Click reset — original layout restored. Reload — original layout restored.
- Manual with `htmlInteractive: false` — exported HTML has no drag/resize behavior, no reset button, no state sidecar. Bundle is smaller.
- Mobile sanity: pan/pinch still works. Touch-drag of nodes is explicitly out of scope for this design; falls under "future enhancements" if requested.

## Future enhancements (out of scope, recorded for context)

- **Touch drag for nodes**: same drag manager wired to `touchstart/move/end`
- **Download as updated `.canvas`**: in-memory state already serializes back to the source format; one button + a `Blob` download
- **Snap-to-grid**: 8/16/32px snapping during drag and resize
- **Multi-select + group drag**: shift-click + marquee selection, group translate
- **Undo/redo**: a small command stack since every operation is already a discrete state mutation
