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

## Verification (2026-10-24, build 9dd17a5)

Desktop (macOS, Obsidian 1.15.0, jcOS vault), all checks run by John:

| Check | Result |
|---|---|
| Paths button on already-open and newly opened canvases | Pass (confirmed via CLI on both open canvases) |
| New path → edit mode, tap to toggle, Done and Esc exit | Pass |
| Empty and duplicate names rejected with a notice | Pass |
| Switch between two paths with a shared edge, then Show all edges | Pass |
| Pan, zoom, add edge, delete on-path edge, undo while highlighted | Pass |
| Rename canvas with a path active: highlight stays, paths survive reopen | Pass |
| Rename the folder holding the canvas: paths still load | Pass |
| Esc inside the Rename modal during edit mode | Pass |
| Close canvas mid-edit-mode: no pill or leftovers | Pass |
| `.canvas` file unchanged after the session (shasum before/after) | Pass (`4736678b…` both times) |
| No errors in `dev:errors` after plugin reload | Pass |

Pending: the phone checks (tap to toggle, menu, pill) and the two-machine sync check.

## Verification after the storage change (2026-10-24, build 9aa2263)

Paths are now stored in the `.canvas` file under `canvasToolsPaths`.

- John migrated the two existing paths ("Workable - Merged", 14 edges, and "Worked - Comments", 19 edges) into Shepherd Factory Lifecycle through the live canvas save. All 33 edge ids resolved, and the diff showed only the new key added.
- Desktop checks: pass (John).
- **Mobile: pass (John).** The Paths button, tap-to-toggle, and switching paths all work on the phone. A path created on mobile ("mobile test", 6 edges) synced back to desktop through Obsidian Sync.
- File diff after the mobile session: only `canvasToolsPaths` and the order of `nodes` changed. No node content changed. The reordering is Obsidian's own z-index sort in `Canvas.getData()`, applied on any save after a node is selected.

## Viewport (2026-10-25, Obsidian 1.15.0)

This was probed through the CLI `eval` on Shepherd Factory Lifecycle and by reading the canvas source in the asar.

- **Current vs target viewport.**
  - Current: `c.x`, `c.y` (the viewport center in canvas coordinates) and `c.zoom` (log2 of the scale), with `c.scale === 2 ** c.zoom`.
  - Target: `c.tx`, `c.ty`, `c.tZoom`.
  - Example: `x 5263.25, y 1119.36, zoom -0.0927, scale 0.9378`.
- **Screen size.** `c.canvasRect` is a DOMRect for the canvas element (example: `1634 × 931`).
- **`c.getViewportBBox()`.** Returns `{minX, minY, maxX, maxY}` in canvas coordinates. It always equals the center ± `canvasRect / scale / 2` (checked: width `1742.4 = 1634 / 0.9378`).
- **Frame loop.** When `viewportChanged` is set, each frame:
  - clamps `tZoom` to `[cC, cfe] = [-4, 1]`, a scale of 1/16 to 2×
  - eases `zoom` toward `tZoom` and `x`/`y` toward `tx`/`ty`, with a factor of `1 - 0.984^dt`
  - when `zoomCenter` is set, zooms around that point instead
  - writes the CSS transform `translate(w/2, h/2) scale(scale) translate(-x, -y)`
- **Moving the view.**
  - To animate to a viewport: set `tx`, `ty`, `tZoom`, set `zoomCenter = null`, then call `markViewportChanged()`, which sets the flag and calls `requestFrame()`.
  - To jump: also set `x`, `y`, `zoom`. `panTo(x, y)` does this for position only.
- **Zoom limits.** `ZOOM_LIMITS = { min: -4, max: 1 }`. `zoomToBbox` additionally clamps to `[-4, log2(1) = 0]` and pads by 10%, which is why the slides feature uses its own fit.
- **No save on viewport change (confirmed live).** A scripted change of `tx`/`ty`/`tZoom` plus `markViewportChanged()` plus `deselectAll()` produced 0 `requestSave` calls. `c.data` stayed the same object, and the `.canvas` file's shasum was unchanged (`76722ae9b541` before and after).
- **`deselectAll()`.** Clears the selection through `updateSelection`, with no save.
- **Caveat.** Frames only run while the Obsidian window is visible (`requestAnimationFrame`). With the window hidden, a viewport change is queued and applies the next time the window shows. The live animation itself is checked by hand in Phase 2.

## Presentation (2026-10-25, Obsidian 1.15.0)

### Keys

From the asar source:

- **Obsidian's keymap.** `window.addEventListener("keydown", onKeyEvent, true)` is registered at app start, so it runs in the capture phase before any plugin listener. It dispatches through a stack of `Scope`s, and a plugin can `app.keymap.pushScope(scope)` to get first say. `scope.register(null, null, fn)` matches every key, and returning `false` consumes the key.
- **The canvas's own global keys.** `Canvas.load()` adds `window.addEventListener("keydown", onGlobalKeydown)` in the **bubble** phase. Space starts hold-to-pan by appending `moverEl`.
- **Approach.** A pushed `Scope` with a catch-all handler runs the presentation action and returns `false`. A window **capture** listener calls `stopPropagation()` on presentation keys, Space, arrows, Delete, and Backspace, so the canvas's bubble listener and element handlers never see them. Arrows, Delete, and Backspace have nothing to act on anyway once the selection is cleared and node clicks are blocked.

### UI to hide (desktop)

These are the children of `canvas.wrapperEl` (`div.canvas-wrapper`): `svg.canvas-background`, `div.canvas-card-menu` (the add-card bar), `div.canvas-controls`, `div.canvas`, and `div.canvas-menu-container` (the selection/edge popover). Presentation mode hides `.canvas-card-menu`, `.canvas-controls`, and `.canvas-menu-container` with CSS scoped under `.ct-presenting`.

### Mobile

Not probed, because no phone is reachable from this session. The same wrapper children are expected. The tap bar sits inside `canvas.wrapperEl` with a safe-area offset. Confirm during the hands-on gate.

### Gate

Presentation keys can be consumed before the canvas sees them, through a keymap Scope plus window-capture `stopPropagation`. Proceed.
