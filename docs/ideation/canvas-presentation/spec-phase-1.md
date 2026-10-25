# Implementation Spec: Canvas Presentation - Phase 1

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

This phase builds the foundation the other two phases sit on. Nothing in it is visible to the user yet.

1. **A viewport spike against the running app.** Read Obsidian's canvas viewport internals and record them in the existing spike doc. This follows the same method as the PR #1 spike: run `obsidian vault=jcOS eval code=...` against an open canvas, then read the source in `~/Library/Application Support/obsidian/obsidian-<ver>.asar`.
2. **Two pure modules with tests.**
   - `slide-model.ts`: the deck data and its transforms, stored in the `.canvas` file under `canvasToolsSlides`. It follows `path-model.ts` exactly.
   - `viewport-fit.ts`: converts between a viewport (center plus log2 zoom) and a canvas rectangle, given a screen size.
3. **`LiveCanvas` gains viewport read/write.** These are new accessors in `canvas-internals.ts`, still the only file that touches undocumented internals.

Known from the asar source (Obsidian 1.15.0), to be confirmed and recorded by the spike:

- **Animated target viewport.** The canvas keeps a target viewport in `tx`, `ty` (center in canvas coordinates) and `tZoom` (log2 of the scale), and animates toward it. The current viewport is `x`, `y`, `zoom`.
- **`zoomToBbox(rect)`.** It sets `tx`/`ty` to the rect center, sets `tZoom = log2(clamp(min(w/rw, h/rh)/1.1, MIN, 1))`, then calls `markViewportChanged()`. The 10% padding and the cap at 1 (100%) are why this phase writes its own fit.
- **`getViewportBBox()`.** Returns the visible rect `{minX, minY, maxX, maxY}`.
- **`canvasRect`.** Holds the screen size of the canvas element (`{width, height}`).

The stored data reuses the path storage pattern: a versioned object under one top-level key, a missing key means empty, and a corrupt value is moved aside on the first write. Extract the two shared helpers (read a keyed value, build a patch) into `canvas-data.ts` so slides and paths don't duplicate them. `path-model.ts` keeps its exported API (`readPathSet`, `pathSetPatch`), now implemented with the helpers. Its tests must pass unchanged.

## Decisions Considered and Rejected

_Carried from the contract; consult before making gap decisions._

- **A slide is a captured canvas rect from the current view.** Rejected: a slide points at a group or node and zooms to fit it. A captured rect matches "view points" literally and needs no groups per framing.
- **A slide can optionally show one highlight path.** Rejected: views only. This lets John walk routes like "Workable - Merged" as slides, reusing PR #1.
- **Per-slide durations with a default.** Rejected: one interval per deck. John wants per-slide control for kiosk loops.
- **Custom viewport fit (set `tx`/`ty`/`tZoom`) instead of `zoomToBbox`.** Rejected: Obsidian's `zoomToBbox`. It caps zoom at 100% and adds 10% padding, so zoomed-in captures would not replay as framed.
- **Phase 1 starts with a viewport spike and is rated medium risk.** Rejected: treat viewport internals as known, low risk. The spike doc has no viewport section.
- **Slides stored in the `.canvas` file.** This carries over from PR #1: Obsidian Sync never syncs files in plugin subfolders.

## Feedback Strategy

**Inner-loop command**: `npx vitest run test/live-canvas/slide-model.test.ts test/live-canvas/viewport-fit.test.ts test/live-canvas/path-model.test.ts`

**Playground**: the vitest suite, plus the Obsidian CLI `eval` against the jcOS vault for the spike.

**Why this approach**: Everything except the spike is pure data and math, so a sub-second test run is the tightest loop. The spike needs the real app.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `src/live-canvas/canvas-data.ts` | Generic read/patch helpers for a plugin-owned top-level key in canvas data |
| `src/live-canvas/slide-model.ts` | Slide deck types, pure transforms, read/patch via `canvas-data.ts` |
| `src/live-canvas/viewport-fit.ts` | Viewport ↔ rect conversion and fit-rect-to-screen |
| `test/live-canvas/slide-model.test.ts` | Deck transforms, validation, read/patch cases |
| `test/live-canvas/viewport-fit.test.ts` | Round trip and cross-screen fit |

### Modified Files

| File Path | Changes |
| --- | --- |
| `src/live-canvas/path-model.ts` | Implement `readPathSet`/`pathSetPatch` with the `canvas-data.ts` helpers. Exported API unchanged. |
| `src/live-canvas/canvas-internals.ts` | Add `getViewportRect()`, `getScreenSize()`, `setViewport()`, `deselectAll()`, and the zoom limits found by the spike |
| `test/live-canvas/canvas-internals.test.ts` | Fake canvas gains viewport fields. Tests for the new accessors and for null when they're missing. |
| `docs/superpowers/spikes/2026-10-24-canvas-internals.md` | New "Viewport" section with spike findings |

## Implementation Details

### Viewport spike

**Overview**: Confirm and record the viewport facts before writing `setViewport`.

**Implementation steps**:

1. With a canvas open in jcOS, read `c.x, c.y, c.zoom, c.tx, c.ty, c.tZoom, c.canvasRect, c.getViewportBBox()`, then pan and zoom and read them again.
2. Find the zoom limits. In the asar, look up the constants used to clamp `tZoom`: the minimum (`cC` in `zoomToBbox`) and the maximum used by `zoomBy` or the wheel handler. Record the numbers.
3. Confirm that writing `tx/ty/tZoom` and then calling `markViewportChanged()` animates to the target. Confirm that also writing `x/y/zoom` jumps there instantly.
4. Confirm that a viewport change never calls `requestSave` and never changes `canvas.data`. Take a shasum before and after a scripted viewport change.
5. Find `deselectAll()` and confirm that it clears the selection without saving.
6. Append a "Viewport" section to the spike doc with exact property names, the constants, and an example value for each.

**Gate**: if `tx/ty/tZoom` writes don't move the view, or a viewport change triggers a save, stop and report to John.

### canvas-data helpers

**Pattern to follow**: `src/live-canvas/path-model.ts` (`readPathSet`, `pathSetPatch`)

```typescript
export interface ReadResult<T> { value: T; corrupt: boolean }
export function readKeyed<T>(canvasData: unknown, key: string, parse: (v: unknown) => T | null, empty: () => T): ReadResult<T>;
export function keyedPatch<T>(canvasData: unknown, key: string, corruptKey: string, parse: (v: unknown) => T | null, value: T): Record<string, unknown>;
```

`path-model.ts` keeps `ReadResult { set, corrupt }` as its public shape. Map it from the generic result.

### Slide model

**Pattern to follow**: `src/live-canvas/path-model.ts`

```typescript
export const SLIDES_KEY = "canvasToolsSlides";
export const SLIDES_CORRUPT_KEY = "canvasToolsSlidesCorrupt";
export const DEFAULT_DURATION_SEC = 10;

export interface Rect { minX: number; minY: number; maxX: number; maxY: number }
export interface Slide { id: string; name: string; rect: Rect; pathId?: string; durationSec?: number }
export interface SlideDeck { version: 1; slides: Slide[] }

export function emptyDeck(): SlideDeck;
export function nextSlideName(deck: SlideDeck): string;            // "Slide N", N = count + 1, skipping names in use
export function addSlide(deck: SlideDeck, id: string, name: string, rect: Rect): SlideDeck;
export function updateSlideRect(deck: SlideDeck, id: string, rect: Rect): SlideDeck;
export function renameSlide(deck: SlideDeck, id: string, name: string): SlideDeck;   // trims
export function moveSlide(deck: SlideDeck, id: string, delta: -1 | 1): SlideDeck;   // no-op at the ends
export function deleteSlide(deck: SlideDeck, id: string): SlideDeck;
export function setSlidePath(deck: SlideDeck, id: string, pathId: string | null): SlideDeck;
export function setSlideDuration(deck: SlideDeck, id: string, sec: number | null): SlideDeck;
export function slideDuration(slide: Slide): number;              // durationSec ?? DEFAULT_DURATION_SEC
export function parseDeck(value: unknown): SlideDeck | null;
export function readDeck(canvasData: unknown): { deck: SlideDeck; corrupt: boolean };
export function deckPatch(canvasData: unknown, deck: SlideDeck): Record<string, unknown>;
```

**Key decisions**:

- All transforms are immutable. An unknown id returns the deck unchanged, matching `path-model`.
- `parseDeck` rejects the whole deck on any of these:
  - a non-finite rect number, or `maxX <= minX` / `maxY <= minY`
  - a non-string `pathId`
  - a `durationSec` that isn't a positive finite number
- Optional fields are stored only when set. Clearing a field deletes the key, so a `.canvas` diff stays minimal.
- Slide names don't need to be unique. Positions are ids, and the menu shows position plus name.

**Feedback loop**:

- **Playground**: `test/live-canvas/slide-model.test.ts`
- **Experiment**:
  - moveSlide at index 0 with -1, and at the last index with +1 (both no-ops)
  - setSlideDuration with 0, -5, NaN, and null (clears)
  - parseDeck with an inverted rect
  - readDeck with a corrupt value, then deckPatch moving it aside
- **Check command**: `npx vitest run test/live-canvas/slide-model.test.ts`

### Viewport fit

```typescript
export interface Viewport { x: number; y: number; zoom: number }   // center (canvas coords), log2 scale
export interface Size { width: number; height: number }
export interface ZoomLimits { min: number; max: number }           // log2 values from the spike

export function viewportToRect(v: Viewport, screen: Size): Rect;
export function fitRect(rect: Rect, screen: Size, limits: ZoomLimits): Viewport;
```

`fitRect`:

- `scale = min(screen.width / rectWidth, screen.height / rectHeight)`
- `zoom = clamp(log2(scale), limits.min, limits.max)`
- center = rect center
- No padding and no 100% cap. A captured rect replays exactly as framed.

**Feedback loop**:

- **Playground**: `test/live-canvas/viewport-fit.test.ts`
- **Experiment**:
  - Round-trip `fitRect(viewportToRect(v, s), s)` ≈ v for zoom -2, 0, 1.5, and 3 on a 1440×900 screen.
  - Fit a rect captured on 1440×900 onto 390×844 (phone). It must be centered and fully visible.
  - Feed it a rect beyond the zoom limits. The result is clamped.
- **Check command**: `npx vitest run test/live-canvas/viewport-fit.test.ts`

### LiveCanvas viewport accessors

**Pattern to follow**: the existing `readData`/`writeData` in `src/live-canvas/canvas-internals.ts`

```typescript
// added to LiveCanvas
getViewportRect(): Rect;                       // canvas.getViewportBBox()
getScreenSize(): Size;                         // canvas.canvasRect
setViewport(v: Viewport, animate: boolean): void; // tx/ty/tZoom (+ x/y/zoom when !animate), zoomCenter = null, markViewportChanged()
deselectAll(): void;
export const ZOOM_LIMITS: ZoomLimits;          // from the spike
```

`getLiveCanvas` returns `null` if any of these is missing: `getViewportBBox`, `markViewportChanged`, `deselectAll`, or `canvasRect`. That's the same fail-soft rule as before.

**Feedback loop**:

- **Playground**: `test/live-canvas/canvas-internals.test.ts` with a fake canvas that records calls
- **Experiment**:
  - `setViewport(v, true)` sets only `t*` and calls `markViewportChanged` once.
  - `setViewport(v, false)` also sets `x/y/zoom`.
  - Neither one calls `requestSave`.
- **Check command**: `npx vitest run test/live-canvas/canvas-internals.test.ts`

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `test/live-canvas/slide-model.test.ts` | Every transform, `nextSlideName`, `slideDuration` default, `parseDeck` rejections, `readDeck` missing/valid/corrupt, `deckPatch` touching only its key and moving corrupt aside |
| `test/live-canvas/viewport-fit.test.ts` | Round trip at several zooms, cross-screen fit, clamp |
| `test/live-canvas/canvas-internals.test.ts` | New accessors, no save on viewport change, null when missing |
| `test/live-canvas/path-model.test.ts` | Unchanged and still green after the helper extraction |

### Manual Testing

- [ ] Spike steps 1–5 recorded in the spike doc.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Viewport fit | Zero-size rect | Corrupt or hand-edited data | Division by zero, NaN viewport | `parseDeck` rejects it. `fitRect` treats a zero dimension as a 1-unit minimum. |
| Viewport fit | Zero-size screen | Canvas hidden or collapsed pane (`canvasRect` 0×0) | NaN zoom | `fitRect` returns the current viewport unchanged when the screen is 0 in either dimension |
| LiveCanvas | Internals renamed | Obsidian update | Slides can't move the view | `getLiveCanvas` returns `null`, and the feature turns off with the single existing warning |
| Slide model | Stale `pathId` | Path deleted after the slide was made | The slide asks for a path that doesn't exist | Phase 3 treats an unknown `pathId` as "no path". The model keeps it, the same as dead edge ids. |

## Validation Commands

```bash
npx vitest run
npm run build
npm run lint
```

## Rollout Considerations

Nothing user-visible ships in this phase. No flag needed.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
