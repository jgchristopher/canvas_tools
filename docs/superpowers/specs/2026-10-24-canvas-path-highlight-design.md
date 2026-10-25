# Canvas path highlight — Design

## Context

John builds canvases that are graphs: nodes connected by edges, where several routes run through the same graph. He wants to look at one route at a time. Select "Route A" and that chain of edges stands out while the rest of the canvas fades. Then switch to "Route B".

Today the plugin only exports canvases (HTML, Excalidraw). It never touches the live canvas view in Obsidian. This feature is the first one that does.

## Goals

- Define named **paths** per canvas. A path is a set of edges.
- An edge can belong to any number of paths. Routes share edges in practice (e.g. `Start → Login` is common to every route).
- Highlight **one path at a time** in the live Obsidian canvas view.
- Drive everything from a **toolbar button** in the canvas's control bar.
- Keep the `.canvas` file and edge labels untouched. Path membership lives in plugin-owned files.
- **Works on touch** (iOS, Android, tablets) as well as mouse. Nothing in the flow may depend on shift-click, hover, or right-click.
- **Safe across synced machines.** John edits canvases on more than one machine. Editing paths on one machine must not wipe paths edited on another.

## Non-goals

- Finding a route automatically (pick start + end node, compute the path). Interesting later, and it should reuse the same highlight, but not in v1.
- Showing two or more paths at once in different colors.
- Path highlighting in the HTML or Excalidraw exports.
- Filtering edges by color, label, node type, group, or note metadata. Those came up as options and were set aside in favor of hand-marked paths.
- Remembering which path was active across canvas close/reopen or app restart.

## Anti-goals

- Writing anything into the `.canvas` file, including through Obsidian's own save. Highlighting must be purely visual. If dimming were done by changing edge/node data (e.g. setting colors), Obsidian would persist it.
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

**Not in `data.json`.** That file is rewritten whole on every save, so two synced machines editing different canvases would clobber each other (and could wipe `linkPreviewCache`).

**One file per canvas** in the plugin's own folder: `<plugin dir>/paths/<key>.json`, written through `app.vault.adapter` (my call). Separate files mean edits to different canvases never conflict. Placing them in the plugin folder keeps them out of the file explorer, and they sync wherever the plugin folder syncs. A visible vault folder was considered and dropped: it clutters the vault, and a dot-folder doesn't sync under Obsidian Sync.

- `<key>` is derived from the canvas's vault path (builder's call: slug, hash, or both). The file also stores the canvas path inside it.
- **Read before every write.** Each edit re-reads that canvas's file, applies the one change, and writes it back. This keeps the overwrite window tiny when two machines edit the same canvas.
- **Pick up remote changes.** When a canvas view opens, and when the menu opens, re-read the file so paths edited on another machine show up. Builder's call whether to also poll or watch the file while a canvas is open.
- Concurrent edits to the *same* canvas on two machines at the same moment can still lose one side. Accepted for v1.

```ts
interface CanvasPathSet {
	canvasPath: string;  // vault path of the canvas this belongs to
	paths: CanvasPath[];
}

interface CanvasPath {
	id: string;          // stable, plugin-generated
	name: string;        // user-visible, unique within the canvas
	edgeIds: string[];   // canvas edge ids from the .canvas JSON
}
```

- **Rename/move** a canvas file inside Obsidian → move its file (listen to `vault.on("rename")`).
- **Delete** a canvas file → delete its file.
- A canvas renamed *outside* Obsidian (Finder, git) orphans its paths. Accepted for v1.
- **Edge ids that no longer exist** in the canvas are ignored when highlighting. Pruning them from storage is the builder's call (lazy prune on load is fine). Don't prune during a live session in a way that would lose membership if the user undoes an edge deletion.
- Edges are identified by the `id` field in the `.canvas` JSON. Obsidian keeps these stable across saves.
- Only the active path id is in memory per view. It is never saved.
- A missing or corrupt path file means "no paths yet" for that canvas, and a notice, never a crash.

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
- `src/live-canvas/path-store.ts` — per-canvas file read/modify/write, rename/delete handling. Keep the path-set transformations (add path, toggle edge, rename) as pure functions so they're testable without the adapter.
- `src/live-canvas/highlighter.ts` — given a view and a set of edge ids, applies/removes classes.
- `src/live-canvas/edit-mode.ts` — tap-to-toggle, the Done control, suppressing Obsidian's edge handling while active.
- `src/live-canvas/toolbar.ts` — the button and its menu.
- `src/live-canvas/index.ts` — wiring: attach to canvas views, register events.
- `main.ts` gets one call into `live-canvas`, same as `registerCommands`.

Exact split is the builder's call.

## Testing

- **Unit tests (vitest)** for `path-store`: create/rename/delete paths, toggle edges, shared edges across paths, canvas rename and delete, missing and corrupt files, read-before-write picking up a change made by "another machine" between two edits.
- **Unit tests** for the "which nodes are on the path" calculation: a pure function from edge list + path edge ids to node ids.
- `highlighter`, `edit-mode`, and `toolbar` touch the live DOM and internals. Test whatever can be isolated against `test/stubs/obsidian.ts`. Beyond that, verify by hand in the jcOS vault (plugin installed at `.obsidian/plugins/canvas-tools/`) on a canvas with two routes that share edges, on desktop and on a phone.
- Manual sync check: edit paths on canvas X on one machine and canvas Y on another, let sync settle, and confirm both survive.
- Manual check: confirm the `.canvas` file is byte-identical before and after a highlight session that included pan/zoom and switching paths.

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

## Calls I made (John to check)

- Marking edges is a tap-to-toggle edit mode, not "select edges, then add". It works the same on touch and mouse.
- Path data lives in one JSON file per canvas in the plugin's folder, not in `data.json` and not in a visible vault folder. It syncs only if your sync covers `.obsidian/plugins/`.
- Simultaneous edits to the same canvas on two machines can still lose one side. Renames outside Obsidian orphan paths. Both accepted for v1.
- If the internals spike finds a blocker, work stops and comes back to you.
- Accent color comes from the theme (`--interactive-accent`).
- Active path is not remembered across close/reopen.
- No command-palette commands in v1. The toolbar button is the only entry point.
