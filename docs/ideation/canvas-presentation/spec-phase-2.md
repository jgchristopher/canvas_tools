# Implementation Spec: Canvas Presentation - Phase 2

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

This phase adds a **Slides** button to the canvas control bar. It works like the Paths button from PR #1. Its menu builds and maintains the deck, and every change is written into the `.canvas` file through `LiveCanvas.writeData`, the same way path changes are. (Revised 2026-10-25: writes now sit outside undo history, so Cmd+Z never changes slides or paths. See `fix: keep slide settings out of canvas undo history`.)

The menu works in two levels so that everything stays a plain tap action on mobile:

- **The Slides menu** lists the slides as "3 · Intro". It has these actions:
  - **Add slide from current view**
  - **Start presentation**
  - **Start auto-play**

  The two Start items are disabled in this phase and are wired up in Phase 3.
- **Tapping a slide** opens a second menu for that slide, with these actions:
  - **Go to**
  - **Update to current view**
  - **Highlight path…**
  - **Duration…**
  - **Rename…**
  - **Move up**
  - **Move down**
  - **Delete…**

This phase also refactors the path feature so slides can drive it. Today `CanvasPathController` keeps `activeId`, edit mode and the `Highlighter` private. Phase 3 has to show a slide's path, and a second highlighter would fight over the `ct-path-*` classes and the 300ms data poll. So the path controller exposes a small public API, and `registerLiveCanvas` creates one path controller and one slides controller per view, giving the slides controller a reference to the path controller.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Reorder with Move up/down in the menu.** Rejected: a drag-to-reorder panel. Plain tap actions need far less UI.
- **A slide can optionally show one highlight path.** Rejected: views only.
- **Per-slide durations with a default.** Rejected: one interval per deck.
- **Slides and paths share one per-view Highlighter through a path-controller API.** Rejected: a separate slide highlighter. Two highlighters would overwrite each other's `ct-path-*` classes and the 300ms poll.
- **A slide is a captured canvas rect from the current view.** Rejected: group- or node-linked slides.

## Feedback Strategy

**Inner-loop command**: `npx vitest run && npm run build`

**Playground**: install the build into jcOS (copy `main.js`, `manifest.json`, `styles.css` to `.obsidian/plugins/canvas-tools/`), then run `obsidian vault=jcOS plugin:reload id=canvas-tools`. Inspect the result with `obsidian vault=jcOS eval code=...`, for example to read `canvas.data.canvasToolsSlides` after an action.

**Why this approach**: The deck logic is already covered by the Phase 1 tests. This phase is UI wiring, so the fastest real check is to reload in the app and inspect the data with the CLI.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `src/live-canvas/slides-controller.ts` | Per-view Slides button, menus, and actions |
| `src/ui/slide-modals.ts` | Duration prompt (number in seconds, or blank for the default) and path picker (`FuzzySuggestModal` over the paths plus "No path") |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/live-canvas/controller.ts` | Add a public API: `setActivePath(id: string \| null): void`, `listPaths(): CanvasPath[]`, `stopEditing(): void` (currently private). No behavior change for the Paths menu. |
| `src/live-canvas/index.ts` | Track a `{ paths, slides }` pair per view. Create the slides controller with the path controller reference. Detach both together. |
| `src/ui/path-name-modal.ts` | Generalize `promptPathName` into `promptName(app, title, initial, validate, messages)` with caller-supplied error messages. Paths keep their current copy. |
| `styles.css` | Nothing, unless the Slides button needs a rule beyond the existing control-item styling |

## Implementation Details

### Path controller API

**Pattern to follow**: existing `setActive`/`stopEditing` in `src/live-canvas/controller.ts`

```typescript
// CanvasPathController, now public
setActivePath(id: string | null): void;   // the current private setActive; unknown id → clears
listPaths(): CanvasPath[];                // readPathSet(canvas.readData()).set.paths
stopEditing(): void;
```

**Implementation steps**:

1. Rename the private `setActive` to the public `setActivePath`, and update the call sites.
2. Make `stopEditing` public.
3. Add `listPaths`.

### Slides controller

**Pattern to follow**: `src/live-canvas/controller.ts`, which covers the button creation, `mutate`, read-only handling, and the corrupt notice.

```typescript
export class SlidesController extends Component {
	constructor(app: App, view: FileView, canvas: LiveCanvas, paths: CanvasPathController);
	filePath: string | null;                     // same retarget-on-rename rule as the path controller
	currentDeck(): SlideDeck;                    // live read, corrupt notice once
	goTo(slide: Slide): void;                    // setViewport(fitRect(...), true) + paths.setActivePath(slide.pathId ?? null)
}
```

**Key decisions**:

- **The button.**
  - Icon `presentation`, aria-label `Slides`, placed in its own control group like Paths.
  - Order: Paths, then Slides.
- **Add slide.**
  - Reads `canvas.getViewportRect()`.
  - Default name: `nextSlideName(deck)`.
  - Id: `shortId("slide")`.
  - No prompt, so adding a slide is one tap. Rename is available afterwards.
- **Go to (outside presentation).**
  - Fits the slide and applies its path, or clears the path if it has none.
  - A `pathId` that no longer exists counts as no path.
- **Update to current view.** Replaces the slide's rect and its path with the one highlighted now, or clears the path if none is. (Revised 2026-10-25, along with Add slide capturing the highlighted path.)
- **Highlight path….** Opens the path picker:
  - "No path" clears it.
  - Picking a path sets it.
  - If the canvas has no paths, the picker lists only "No path" and shows the empty-state text "No paths on this canvas".
- **Duration….**
  - A number prompt in seconds. Blank clears it back to the default.
  - It accepts a finite number from 1 to 3600 and rejects anything else with a notice.
  - The prompt shows the current value or "Default (10s)".
- **Rename….** Uses `promptName`, which rejects empty names. Duplicates are allowed.
- **Delete….** Asks for confirmation using the same pattern as `confirmDelete`, with copy "Delete slide \"{name}\"?".
- **Read-only canvas.** Every editing action is disabled. Go to still works.
- **Copy.**
  - "Couldn't read saved slides for this canvas. Starting fresh."
  - "Couldn't save slides for this canvas."
  - "Duration must be between 1 and 3600 seconds."
  - "Slide name can't be empty."

**Implementation steps**:

1. Add the public API to the path controller.
2. Generalize the name modal. Paths keep their exact copy.
3. Add `slide-modals.ts`.
4. Build the slides controller, with menus, actions, and `mutate` via `deckPatch`.
5. Wire it into `index.ts`.
6. Build, install, and reload. Check each action with `eval` reads of `canvas.data.canvasToolsSlides`.

**Feedback loop**:

- **Playground**: the installed plugin in jcOS, plus CLI `eval`.
- **Experiment**:
  - Add 3 slides at different zooms (including zoomed in past 100%).
  - Reorder them, then set a path and a duration on one.
  - Rename and delete.
  - Undo with Cmd+Z after a reorder.
  - After each step, `eval` the deck. The order, fields, and the `nodes`/`edges` keys must be unchanged.
- **Check command**: `obsidian vault=jcOS eval code="JSON.stringify(app.workspace.getLeavesOfType('canvas')[0].view.canvas.data.canvasToolsSlides)"`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `test/live-canvas/path-model.test.ts`, `slide-model.test.ts` | Unchanged and still green after the refactor |

### Manual Testing

- [ ] The Slides button appears next to Paths on every open canvas.
- [ ] Add, Go to, Update, path, duration, rename, move, and delete each change only `canvasToolsSlides` (check with a diff against a copy of the file).
- [ ] A slide captured zoomed in past 100% goes back to the same framing.
- [ ] Cmd+Z undoes a slide action.
- [ ] The Paths menu still works as before, including edit mode.
- [ ] On a read-only canvas, the edit actions are disabled.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Slides controller | Deleted path on a slide | A path is removed after the slide was made | Go to shows no highlight | Treat the unknown id as "no path". The picker shows the current value as "(missing path)". |
| Slides controller | Two controllers per view leak | Rename or file switch rebuilds one and not the other | A duplicate button, or a stale reference to the path controller | `index.ts` creates and detaches the pair together, keyed by view |
| Slides controller | Edit during path edit mode | The user adds a slide while editing a path | Edge taps toggle membership | Slide actions don't depend on edge taps. Go to calls `paths.stopEditing()` first. |
| Name/duration modals | Invalid input | Blank name, "abc" duration | Bad data saved | Validated before `mutate`, and a notice keeps the modal open |

## Validation Commands

```bash
npx vitest run
npm run build
npm run lint
```

## Rollout Considerations

- **Rollback plan**: the earlier build. Slide data stays in the `.canvas` file under its own key, and older builds ignore it.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
