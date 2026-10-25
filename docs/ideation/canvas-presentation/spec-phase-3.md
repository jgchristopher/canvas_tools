# Implementation Spec: Canvas Presentation - Phase 3

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

This phase adds presentation mode and auto-play. It's built in two layers so the logic can be tested without a DOM:

- **`PresentationSession` (pure, testable).**
  - Holds the deck snapshot, the current index, and an `Autoplay` timer.
  - Drives the canvas only through `LiveCanvas.setViewport` and the path controller API.
  - Never calls `writeData`, `requestSave`, or anything else that saves.
  - Its helpers are `presentation-keys.ts`, which maps a key to an action, and `autoplay.ts`, which schedules timeouts through an injectable clock.
- **`PresentationView` (DOM shell).** A `Component` that:
  - adds `ct-presenting` to the canvas wrapper, so CSS hides the canvas UI
  - renders the tap bar
  - captures keys and pointer events
  - forwards everything to the session

It starts with a spike, because the hide list and key capture depend on Obsidian internals that haven't been probed yet:

1. **Canvas UI elements.** List every element to hide on desktop and mobile:
   - the control bar `.canvas-controls`, and the card menu `.canvas-card-menu`
   - the selection/edge menu `.canvas-menu-container`
   - any mobile canvas toolbar
2. **Key bindings.** Find how the canvas binds Space (hold-to-pan: `onGlobalKeydown` appends `moverEl`), arrow keys (node nudge), and Delete/Backspace. Find what listens where: window, scope, or wrapper.
3. **Capture point.** Confirm that a capture-phase `keydown` listener on `window`, or an Obsidian `Scope` pushed onto `app.keymap`, runs before them and can stop them.
4. **Recording.** Add a "Presentation" section to the spike doc. **Gate:** if presentation keys can't be stopped before the canvas sees them, stop and report to John.

Nothing in the canvas can save while presenting:

- The selection is cleared on start (`canvas.deselectAll()`).
- Pointer events on nodes and edges are blocked in the capture phase, so nothing can be selected, dragged, resized, or edited.
- Presentation keys are consumed before the canvas sees them.
- Arrow keys, Delete, and Backspace are always consumed while presenting.
- Panning and zooming empty canvas with the mouse or trackpad stays allowed, because viewport changes never save (confirmed in the Phase 1 spike).

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **Built-in presentation keys plus bindable Next/Previous commands.** Rejected: commands only, or built-in keys only. Clickers work out of the box, and the keys stay customizable.
- **Presentation mode hides the canvas UI only.** Rejected: true browser full-screen. Fewer edge cases (Esc, popouts, mobile), and Obsidian's own full-screen covers projector use.
- **On-screen tap bar for touch navigation.** Rejected: swipe gestures. The bar doesn't conflict with canvas pan and pinch.
- **Auto-play is in the MVP.** Rejected: a later tier.
- **Per-slide durations with a default.** Rejected: one interval per deck.
- **Exit clears all path highlights.** Rejected: restoring the path that was showing before. John's choice.
- **Presentation captures keys before the canvas and blocks node select/drag/nudge.** Rejected: plain key listeners alongside the canvas's own handling. Space pans and arrow keys nudge nodes, and a nudge or a selection saves the file, which breaks Goal 4.
- **Auto-play and the key map are pure modules with fake-timer tests, and a no-write test guards Goal 4.** Rejected: only judgment checks.
- **Slides and paths share one per-view Highlighter.** Rejected: a separate slide highlighter.

## Feedback Strategy

**Inner-loop command**: `npx vitest run test/live-canvas/autoplay.test.ts test/live-canvas/presentation-no-write.test.ts`

**Playground**: the vitest suite with `vi.useFakeTimers()` for the logic. For the shell: the installed plugin in jcOS with CLI `eval`, plus a `shasum` of the canvas file before and after.

**Why this approach**: Timing and the no-write guarantee are mechanical, so fake timers and a save spy catch regressions in milliseconds. Only the visual shell needs the app.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `src/live-canvas/presentation-keys.ts` | `keyAction(evt)` → action or null |
| `src/live-canvas/autoplay.ts` | `Autoplay` timer with an injectable clock |
| `src/live-canvas/presentation-session.ts` | Deck snapshot, index, navigation, auto-play, and viewport and path application |
| `src/live-canvas/presentation-view.ts` | DOM shell: classes, tap bar, capture listeners, resize refit |
| `test/live-canvas/autoplay.test.ts` | Timer behavior and the key map |
| `test/live-canvas/presentation-no-write.test.ts` | Full session against a stub canvas, with zero saves |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/live-canvas/slides-controller.ts` | Enable **Start presentation** and **Start auto-play**, and own the active `PresentationView` |
| `src/live-canvas/index.ts` | Register the commands `next-slide`, `previous-slide`, `start-presentation`, and `stop-presentation`. Each finds the slides controller for the active view and is enabled only when it applies (`checkCallback`). |
| `src/live-canvas/canvas-internals.ts` | Selectors and constants from the spike, if any are needed |
| `styles.css` | `.ct-presenting` hide rules, tap bar styles, and the counter |
| `docs/superpowers/spikes/2026-10-24-canvas-internals.md` | "Presentation" section |

## Implementation Details

### Key map

```typescript
export type PresentationAction = "next" | "prev" | "first" | "last" | "toggle-play" | "exit";
export function keyAction(evt: { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): PresentationAction | null;
```

Mapping:

| Key | Action |
| --- | --- |
| ArrowRight, Space (`" "`), PageDown | next |
| ArrowLeft, PageUp | prev |
| Home | first |
| End | last |
| `p` or `P` | toggle-play |
| Escape | exit |

Any key pressed with Ctrl, Meta, or Alt returns `null`, so Obsidian hotkeys still work.

### Autoplay

```typescript
export interface Clock { set(fn: () => void, ms: number): number; clear(id: number): void }
export class Autoplay {
	constructor(clock: Clock, durationMs: (index: number) => number, onAdvance: () => void);
	start(index: number): void;   // schedules onAdvance after durationMs(index)
	stop(): void;
	readonly playing: boolean;
}
```

The session calls `start(newIndex)` after every auto-advance. Manual navigation calls `stop()`, which matches "any manual navigation pauses it".

### Presentation session

```typescript
export interface PathApi { setActivePath(id: string | null): void; stopEditing(): void; hasPath(id: string): boolean }
export class PresentationSession {
	constructor(canvas: LiveCanvas, deck: SlideDeck, paths: PathApi, clock: Clock, onChange: () => void);
	readonly index: number; readonly count: number; readonly playing: boolean;
	begin(startIndex: number, autoplay: boolean): void;  // paths.stopEditing(), canvas.deselectAll(), show(startIndex), start autoplay if asked
	act(action: PresentationAction): void;              // manual nav stops autoplay; toggle-play flips; exit → end()
	refit(): void;                                      // re-apply current slide on resize
	end(): void;                                        // stop timer, paths.setActivePath(null)
}
```

- `show(i)` and `refit()` skip `setViewport` when `canvas.getScreenSize()` is 0 in either dimension (hidden pane), because `fitRect` has no meaningful fit there.
- `show(i)` sets the viewport to `fitRect(slide.rect, canvas.getScreenSize(), ZOOM_LIMITS)` with animation. It sets the path to `slide.pathId` if `paths.hasPath(id)` is true, and to `null` otherwise.
- **Next on the last slide.**
  - When auto-play is running, it wraps to the first slide.
  - When the user presses next manually, it stays on the last slide. Wrapping only happens for the loop.
- **Prev on the first slide** stays on the first slide.
- A deck with 0 slides can't start. The menu item is disabled with the hint "Add a slide first".

### Presentation view

**Pattern to follow**: `src/live-canvas/edit-mode.ts`, which covers capture listeners, the pill DOM, and cleanup in `onunload`.

- **`onload`.**
  - Add `ct-presenting` to the root, and render the bar: `‹`, `3 / 7`, `›`, `⏵`/`⏸`, `✕`. Use tap targets of at least 44px.
  - Register capture-phase `keydown` on the window or Scope chosen by the spike. Handle `keyAction`, then call `preventDefault` and `stopImmediatePropagation`.
  - Also consume the arrow keys, Delete, and Backspace when unmapped.
  - Register capture-phase `pointerdown`, `mousedown`, `click`, `dblclick`, and `contextmenu` on the root. Block them when the target is inside a node, an edge, or a label.
  - Register `resize` on the window, which calls `session.refit()`.
- **`onunload`.** Remove the class and the bar, then call `session.end()`.
- **Live counter.** `onChange` re-renders the counter and the play icon.

### Commands

| id | name | enabled when |
| --- | --- | --- |
| `start-presentation` | Start presentation | Active view is a canvas with 1 or more slides |
| `stop-presentation` | Stop presentation | A presentation is running in the active view |
| `next-slide` | Next slide | A presentation is running |
| `previous-slide` | Previous slide | A presentation is running |

No default hotkeys. The built-in keys cover clickers.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `test/live-canvas/autoplay.test.ts` | See the key cases below |
| `test/live-canvas/presentation-no-write.test.ts` | See the key cases below |

**Key test cases for `autoplay.test.ts`** (fake timers):

- 3 slides with durations 5s, unset, and 2s advance at 5000ms, then 10000ms, then 2000ms, and wrap to index 0.
- Calling `act("next")` mid-interval stops auto-play, and no advance fires afterwards.
- `toggle-play` resumes from the current slide using its full duration.
- The `keyAction` table: every mapped key, the modifier keys returning null, and unmapped keys returning null.

**Key test cases for `presentation-no-write.test.ts`:**

- `getLiveCanvas(fakeView)` with a `requestSave` spy and a frozen copy of `data`.
- Run `begin(0, true)`, then next, prev, first, last, then five auto-play ticks, then toggle-play, then exit.
- Assert that `requestSave` was called 0 times and `data` deep-equals the copy.
- Assert the path API calls: `stopEditing` once, `setActivePath` with each slide's path (or null for an unknown id), and a final `setActivePath(null)`.

### Manual Testing

- [ ] Spike findings recorded, and the gate passed.
- [ ] Desktop: a 5+ slide deck runs on Shepherd Factory Lifecycle with arrows, Space, PageUp, and PageDown, and Esc exits.
- [ ] Space doesn't start a pan. Arrow keys don't move a node, even if one was selected before starting.
- [ ] A clicker (PageUp/PageDown) works, if one is available.
- [ ] Auto-play with mixed durations loops for 10+ minutes.
- [ ] Each slide shows its own path or none. Exit clears all highlights.
- [ ] The `shasum` of the canvas file is unchanged after a full session with no slide edits.
- [ ] Phone: after sync and plugin reload, the tap bar runs the deck, and the canvas UI is hidden.
- [ ] Resizing the window or rotating the phone refits the current slide.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| View | Keys leak to the canvas | The canvas listens earlier than our capture | Space pans, arrows nudge nodes, the file saves | The spike gate. Pointer blocking plus `deselectAll` means nothing is selected to nudge. |
| View | Esc also closes something else | The modal or Obsidian Esc handling runs first | Exit doesn't fire, or fires twice | Our capture runs first and stops propagation. `end()` is idempotent. |
| Session | Deck edited on another machine mid-presentation | A sync reload replaces `canvas.data` | The presentation runs a stale deck | Accepted: the session runs on its snapshot. A fresh start picks up changes. |
| Session | Slide's path deleted | A path is removed after the slide was set | The highlight call with an unknown id | `hasPath` check means no path |
| Autoplay | Timer survives exit | Unload or close during auto-play | An advance runs on a dead view | `end()` and `onunload` always call `stop()`. Covered by the test. |
| View | Canvas closed or file switched mid-presentation | The user closes the tab | Orphaned bar or classes | The view is a child of the slides controller, which is detached with the view |
| View | Bar hidden behind mobile chrome | Safe areas, mobile toolbar | Can't exit on the phone | Position the bar inside the canvas wrapper, bottom center, with an `env(safe-area-inset-bottom)` offset. Check on the phone. |

## Validation Commands

```bash
npx vitest run
npm run build
npm run lint
```

## Rollout Considerations

- **Rollback plan**: the previous build. Presentation stores nothing, so there's nothing to clean up.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
