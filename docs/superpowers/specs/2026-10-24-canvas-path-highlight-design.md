# Canvas path highlight — Design

## Context

John builds canvases that are graphs: nodes connected by edges, where several routes run through the same graph. He wants to look at one route at a time. Select "Route A" and that chain of edges stands out while the rest of the canvas fades. Then switch to "Route B".

Today the plugin only exports canvases (HTML, Excalidraw). It never touches the live canvas view in Obsidian. This feature is the first one that does.

## Goals

- Define named **paths** per canvas. A path is a set of edges.
- An edge can belong to any number of paths. Routes share edges in practice (e.g. `Start → Login` is common to every route).
- Highlight **one path at a time** in the live Obsidian canvas view.
- Drive everything from a **toolbar button** in the canvas's control bar.
- Keep edge labels untouched. Path data lives in the `.canvas` file under one plugin-owned top-level key, written only when the user edits paths (revised 2026-10-24, see Data).
- **Works on touch** (iOS, Android, tablets) as well as mouse. Nothing in the flow may depend on shift-click, hover, or right-click.
- **Safe across synced machines.** John edits canvases on more than one machine. Editing paths on one machine must not wipe paths edited on another.

## Non-goals

- Finding a route automatically (pick start + end node, compute the path). Interesting later, and it should reuse the same highlight, but not in v1.
- Showing two or more paths at once in different colors.
- Path highlighting in the HTML or Excalidraw exports.
- Filtering edges by color, label, node type, group, or note metadata. Those came up as options and were set aside in favor of hand-marked paths.
- Remembering which path was active across canvas close/reopen or app restart.

## Anti-goals

- Writing to the `.canvas` file when the user didn't edit paths. Showing, switching, or clearing a highlight must be purely visual and never mark the canvas dirty. If dimming were done by changing edge/node data (e.g. setting colors), Obsidian would persist it.
- Touching any part of the `.canvas` JSON besides the plugin's own top-level key: no changes to nodes, edges, or other keys.
- Text added to edge labels.
- Leaking styles or listeners after the canvas closes, the path is cleared, or the plugin unloads.

## Interaction

**Toolbar button.** One new button in the canvas view's control bar (the vertical stack on the right with zoom in/out, zoom to fit, etc.). It shows as active while a path is highlighted. Clicking it opens a menu:

```
Show all edges
● Route A          ← active path, radio-style
○ Route B
───────────
Edit edges of active path
New path…
Rename active path…
Delete active path…
```

- **Selecting a path name** highlights it. Selecting the active one again, or **Show all edges**, clears the highlight.
- **New path…** prompts for a name, creates an empty path, makes it active, and drops straight into edit mode.
- **Rename / Delete** act on the active path and are disabled when none is active. Delete asks for confirmation.
- Builder's call: Obsidian `Menu` (which already renders as a touch-friendly sheet on mobile) or a small custom popover, so long as it works by tap.

**Edit mode (how edges get marked).** Chosen over "select edges, then add selected to…" because multi-select depends on shift-click, which touch doesn't have.

- While editing, the active path is shown in the same dim-the-rest style.
- **Tap or click an edge** to toggle it in or out of the path. It brightens or dims immediately.
- A visible **Done** control (e.g. a pill at the top of the canvas reading "Editing Route A · Done") ends edit mode. Esc also ends it on desktop.
- While editing, a tap on an edge only toggles membership. It must not also open Obsidian's edge editing (label edit, the edge toolbar). Taps on nodes and empty canvas, panning, and zooming behave normally.
- Edge tap targets on touch must be forgiving. Canvas edges are thin lines, so hit-testing needs a widened target (builder's call how, e.g. a wider invisible stroke or distance-to-path).
- This means intercepting edge clicks/taps in the live canvas, which adds to the internals risk below.

**Highlight style ("dim the rest")** — chosen from mockups:

- Edges in the active path: drawn in an accent color, thicker than normal.
- Nodes touched by an active-path edge (either end): full opacity, accent-colored border.
- Every other edge: heavily faded (roughly 15% opacity) but still visible.
- Every other node: faded (roughly 30% opacity) but still visible and readable enough to orient by.
- Labels follow their edge's state.
- Accent color: the theme's `--interactive-accent` (my call, so it fits light and dark themes). Exact opacities are the builder's call.

**Behavior while highlighted.** The canvas stays fully usable: pan, zoom, select, edit, add and delete nodes and edges. New edges are off-path, so they appear dimmed. If an on-path edge is deleted, it drops out of the highlight. Edits must not clear or break the highlight.

**Lifetime.** The highlight belongs to one open canvas view. Closing the view clears it. Two views of different canvases (or the same canvas in two panes) each have their own toolbar button and active path. Builder's call whether the same canvas in two panes shares the active path.

## Data

**Stored inside the `.canvas` file**, under one top-level key, `"canvasToolsPaths"`. John chose this on 2026-10-24.

**Why it changed.** The first build kept one JSON file per canvas in `<plugin dir>/paths/`. Desktop checks all passed. Then a look at Obsidian Sync's source showed it syncs only `manifest.json`, `main.js`, `styles.css`, and `data.json` inside each plugin folder, so path files never reached other machines. Three alternatives were weighed:

- **`data.json`:** synced, but it's one file for every canvas. Offline edits on two machines can wipe each other's paths on any canvas. Rejected.
- **One Markdown file per canvas in a visible vault folder:** synced and conflict-safe across canvases, but it clutters the file explorer. Rejected.
- **Inside the `.canvas` file:** chosen. It always syncs because it is the canvas, and renames, moves, and deletes need no handling. The cost is that editing paths now modifies the canvas file, which reverses the original anti-goal.

**Verified in Obsidian 1.15.0 source:**

- `Canvas.getData()` returns `{ ...this.data, nodes, edges }`, so unknown top-level keys survive every save Obsidian makes.
- `Canvas.requestSave(pushHistory = true)` refreshes `canvas.data` from `getData()`, pushes an undo snapshot, and calls the view's debounced save.
- `setViewData` (file reload, including a sync bringing a newer version) replaces `canvas.data`.

**How writes work:**

- Path edits go through the open canvas, never `vault.modify` behind its back. Set `canvas.data.canvasToolsPaths`, then call `canvas.requestSave(true)`.
- Path edits become **undo steps**. Undo restores whole-canvas snapshots, so skipping the snapshot would let a later undo of an unrelated edit silently revert a path change. With snapshots, Cmd+Z after a toggle undoes the toggle.
- **Reads are live.** The controller reads `canvas.data.canvasToolsPaths` whenever it needs the set (menu open, after an undo or reload). It never trusts a cached copy, so a synced-in version or an undo shows up.
- Concurrent edits to the *same* canvas on two machines can still lose one side, the same as any canvas edit under Sync. Accepted for v1.
- Read-only canvases (`canvas.readonly`) disable the edit actions.

```ts
// value of the "canvasToolsPaths" key
interface CanvasPathSet {
	version: 1;
	paths: CanvasPath[];
}

interface CanvasPath {
	id: string;          // stable, plugin-generated
	name: string;        // user-visible, unique within the canvas
	edgeIds: string[];   // canvas edge ids from the .canvas JSON
}
```

- **Edge ids that no longer exist** in the canvas are ignored when highlighting, never pruned. Undoing an edge deletion brings it back lit.
- Edges are identified by the `id` field in the `.canvas` JSON. Obsidian keeps these stable across saves.
- Only the active path id is in memory per view. It is never saved.
- A missing key means "no paths yet". A key with a value that doesn't parse means "no paths" plus a one-time notice. The first path edit moves the bad value to `"canvasToolsPathsCorrupt"` before writing, so nothing is silently destroyed.
- **Migration:** paths made with the first build live in `<plugin dir>/paths/*.json` and are not migrated (one test canvas on one machine). The old folder can be deleted by hand.

## Integration with Obsidian's canvas (risk)

Obsidian has **no public Canvas view API**. This feature depends on internal objects. All names below are from community knowledge, **unverified**, and must be checked against the running app before planning around them:

- `leaf.view.getViewType() === "canvas"`, and `leaf.view.canvas` as the canvas instance.
- `canvas.edges: Map<string, Edge>` and `canvas.nodes: Map<string, Node>`. Each edge has `id`, `from.node`, `to.node`, and DOM elements for its line, arrowheads, and label. Each node has `nodeEl`.
- A way to catch a tap/click on a specific edge before Obsidian's own edge handling (edge DOM elements carrying a reference back to the edge, or hit-testing canvas coordinates against `canvas.edges`).
- The control bar in the view's DOM (`.canvas-controls` / `.canvas-control-group`) for the toolbar button, on desktop and mobile.

**First task in the plan: a spike against the running app** (desktop and a phone) confirming each of the above. If any one turns out to be impossible, stop and return to John with what was found. Do not ship a reduced version without him.

Requirements that follow from the risk:

- **Fail soft.** If the internals aren't there (shape changed in an Obsidian update), the button doesn't appear, or appears and shows a notice. No exceptions in the console on every canvas open.
- **Keep internal access in one module** (e.g. `src/live-canvas/canvas-internals.ts`) with narrow typed accessors. The rest of the feature calls that module and never pokes internals directly. When Obsidian changes, that's the one file to fix.
- **Prefer CSS classes over mutating canvas objects.** Toggle classes on edge/node DOM elements (or on the canvas wrapper with per-element marker classes) and put the styling in `styles.css`. That keeps the visual state off the canvas data, so nothing can be saved by accident. It also matches the repo's lint rule against static style assignment.
- **Re-apply on change.** The canvas re-renders and adds/removes elements (new edges, undo, file reload from disk, scrolling elements in and out of render). The highlight must stay correct through that. Builder's call how: a canvas event, a `MutationObserver` on the canvas element, or re-applying on a throttled schedule. Must be cleaned up via `register*` helpers.
- **Attach to every canvas view**, including ones already open when the plugin loads and ones opened later (`layout-change` / `active-leaf-change`). Remove the button and all classes on plugin unload.

## Code layout

Following the repo's conventions (small `main.ts`, single-responsibility modules, ~200–300 lines max per file):

- `src/live-canvas/canvas-internals.ts` — the only file that touches undocumented canvas objects.
- `src/live-canvas/path-model.ts` — pure path-set transformations (add path, toggle edge, rename), plus reading the set out of canvas data and writing it back.
- `src/live-canvas/highlighter.ts` — given a view and a set of edge ids, applies/removes classes.
- `src/live-canvas/edit-mode.ts` — tap-to-toggle, the Done control, suppressing Obsidian's edge handling while active.
- `src/live-canvas/toolbar.ts` — the button and its menu.
- `src/live-canvas/index.ts` — wiring: attach to canvas views, register events.
- `main.ts` gets one call into `live-canvas`, same as `registerCommands`.

Exact split is the builder's call.

## Testing

- **Unit tests (vitest)** for `path-model`: create/rename/delete paths, toggle edges, shared edges across paths, reading from canvas data with the key missing, valid, or corrupt, writing back without touching `nodes`, `edges`, or other keys, and moving a corrupt value aside.
- **Unit tests** for the "which nodes are on the path" calculation: a pure function from edge list + path edge ids to node ids.
- `highlighter`, `edit-mode`, and `toolbar` touch the live DOM and internals. Test whatever can be isolated against `test/stubs/obsidian.ts`. Beyond that, verify by hand in the jcOS vault (plugin installed at `.obsidian/plugins/canvas-tools/`) on a canvas with two routes that share edges, on desktop and on a phone.
- Manual sync check: edit paths on canvas X on one machine and canvas Y on another, let sync settle, and confirm both survive.
- Manual check: confirm the `.canvas` file is byte-identical before and after a highlight session that included pan/zoom and switching paths, with no path edits.
- Manual check: after path edits, a diff of the `.canvas` file shows only the `canvasToolsPaths` key changed. Cmd+Z undoes the last toggle.

## Decisions made in conversation

- Live Obsidian canvas view, not the exports.
- Mark paths by hand ahead of time. Route finding is later.
- Shared edges must work, so color alone isn't enough.
- Membership stored by the plugin. Labels stay clean.
- Highlight style: dim the rest (chosen over hiding other edges and over glow-only).
- One path at a time.
- Entry point: toolbar button on the canvas.
- Used across multiple synced machines.
- v1 must be touch-friendly.
- Path data stored inside the `.canvas` file (chosen after Obsidian Sync was found not to sync plugin subfolders).

## Calls I made (John to check)

- Marking edges is a tap-to-toggle edit mode, not "select edges, then add". It works the same on touch and mouse.
- Top-level key name `canvasToolsPaths`.
- Path edits are undo steps (needed for correctness, see Data).
- Paths from the first build's `paths/` folder are not migrated.
- Simultaneous edits to the same canvas on two machines can still lose one side. Accepted for v1.
- If the internals spike finds a blocker, work stops and comes back to you.
- Accent color comes from the theme (`--interactive-accent`).
- Active path is not remembered across close/reopen.
- No command-palette commands in v1. The toolbar button is the only entry point.
