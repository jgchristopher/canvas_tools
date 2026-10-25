# Canvas Presentation Contract

**Created**: 2026-10-25
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

John walks people through Obsidian canvases (for example Shepherd Factory Lifecycle) by panning and zooming by hand. Mostly this happens over screen-share in meetings, sometimes on a projector, and possibly on an unattended display that should cycle on its own.

Hand navigation is slow, inconsistent between runs, and pulls attention away from the talk. There is no way to save a sequence of viewpoints, step through them with a keyboard or presentation clicker, or let the canvas cycle unattended.

## Goals

1. Present a deck of 5+ slides on Shepherd Factory Lifecycle start to finish using only keyboard or clicker, with zero mouse panning or zooming.
2. Auto-play a deck unattended: it loops with each slide's own duration (10s default) for 10+ minutes without manual input.
3. The same deck, after Obsidian Sync, plays on John's phone using only the on-screen tap bar.
4. A presentation session that does not edit slides leaves the .canvas file byte-identical.
5. A slide can carry one saved highlight path: presenting that slide shows the path highlighted, and moving to a slide without a path shows no highlight.

## Success Criteria

- [ ] Slide model: add, update-to-view, rename, move up/down, delete, set/clear path, set/clear duration, default duration, read/patch canvas data with missing/valid/corrupt values — check: `npx vitest run test/live-canvas/slide-model.test.ts` → exits 0
- [ ] Viewport fit: a rect captured at any zoom (including above 100%) replays to the same framing on the same screen size, and is centered and fully visible on a different screen size — check: `npx vitest run test/live-canvas/viewport-fit.test.ts` → exits 0
- [ ] Auto-play and key map logic: each slide's duration is used, missing duration falls back to 10s, the last slide wraps to the first, manual prev/next pauses auto-play, and each presentation key maps to the right action — check: `npx vitest run test/live-canvas/autoplay.test.ts` → exits 0
- [ ] A presentation session never saves: start, next/prev, Home/End, auto-play ticks, path apply and exit against a stub canvas call requestSave/setData 0 times — check: `npx vitest run test/live-canvas/presentation-no-write.test.ts` → exits 0
- [ ] Full suite, type-check/bundle, and lint pass — check: `npx vitest run && npm run build && npm run lint` → exits 0
- [ ] Goal 1: keyboard/clicker-only presentation of a 5+ slide deck — judgment call: John presents a 5+ slide deck on Shepherd Factory Lifecycle using only arrow keys/Space/PageUp/PageDown and Esc, with no mouse pan or zoom
- [ ] Goal 2: unattended auto-play loop — judgment call: John starts auto-play on a deck with mixed per-slide durations and confirms it loops with the right timing for 10+ minutes untouched
- [ ] Goal 3: phone playback via tap bar — judgment call: John opens the synced canvas on his phone and runs the deck using only the tap bar (prev, next, play/pause, exit)
- [ ] Goal 4: no writes during a non-editing session — judgment call: John records shasum of the .canvas file, runs a full presentation and auto-play session without editing slides, and confirms the shasum is unchanged
- [ ] Goal 5: per-slide path highlight — judgment call: John builds a deck where some slides carry 'Workable - Merged' or 'Worked - Comments' and others none, presents it, and confirms each slide shows exactly its own path or no highlight

## Scope Boundaries

### In Scope

- Slides button in the canvas control bar with a menu: Add slide from current view, slide list, Start presentation, Start auto-play — Entry point, matching the Paths button pattern from PR #1
- Per-slide actions: Go to, Update to current view, Set/clear highlight path, Set duration, Rename, Move up, Move down, Delete — Everything needed to build and maintain a deck by tap. Desktop authoring is verified; mobile authoring uses the same menu but no criterion checks it (Goal 3 covers mobile playback only)
- Slide = captured canvas rect (from the current viewport) plus optional path id and optional duration — John chose captured view rects; paths reuse PR #1's highlighter
- Presentation mode: hides canvas UI, shows a tap bar (prev, n/total, next, play/pause, exit) — Works the same on screen-share, projector and phone
- Keys while presenting: Right/Space/PageDown next, Left/PageUp previous, Home/End, P play/pause, Esc exit; plus Next/Previous slide commands bindable in Hotkeys — PageUp/PageDown make presentation clickers work out of the box
- Go-to-slide fits the slide rect to the screen without the 100% zoom cap and applies its path highlight (or none) — Exact framing at any capture zoom; consistent highlight per slide
- Auto-play: per-slide durations with a 10s default, loops at the end, any manual navigation pauses it — Kiosk/unattended use is on the table
- Slides stored in the .canvas file under canvasToolsSlides, written through the canvas save as undo steps — Same sync-safe storage as paths (Obsidian Sync does not sync plugin subfolders)
- Exit clears all path highlights; starting a presentation ends path edit mode — John chose clear-all on exit

### Out of Scope

- Slides in the HTML export — Live canvas only for now
- Transitions beyond Obsidian's own pan/zoom animation — Not needed for the goals
- Speaker notes and presenter view — Not requested
- Slide thumbnails — Menu list by name is enough
- Multiple decks per canvas — One deck per canvas keeps storage and UI simple
- True browser full-screen — John chose canvas-UI-only hiding; Obsidian's own full-screen covers the rest
- Drag-to-reorder panel — John chose move up/down in the menu
- Swipe gestures — Conflict with canvas pan; John chose the tap bar

### Future Considerations

- Slides in the interactive HTML export
- Speaker notes
- Group-linked slides that follow a group when it moves

## Decisions Considered and Rejected

- **A slide is a captured canvas rect from the current view** — rejected: A slide points at a group or node and zooms to fit it. Matches 'view points' literally and needs no groups per framing
- **A slide can optionally show one highlight path** — rejected: Views only. Lets John walk routes like 'Workable - Merged' as slides, reusing PR #1
- **Auto-play is in the MVP** — rejected: Full tier after manual presenting. John wants unattended use available from the first version
- **Built-in presentation keys plus bindable Next/Previous commands** — rejected: Commands only, or built-in keys only. Clickers work out of the box and keys stay customizable
- **Presentation mode hides canvas UI only** — rejected: True browser full-screen. Fewer edge cases (Esc, popouts, mobile); Obsidian's full-screen covers projector use
- **Per-slide durations with a default** — rejected: One interval per deck. John wants per-slide control for kiosk loops
- **On-screen tap bar for touch navigation** — rejected: Swipe gestures. No conflict with canvas pan and pinch
- **Reorder with Move up/down in the menu** — rejected: Drag-to-reorder panel. Plain tap actions, far less UI
- **Exit clears all path highlights** — rejected: Restore the path showing before the presentation. John's choice
- **Custom viewport fit (set tx/ty/tZoom) instead of zoomToBbox** — rejected: Obsidian's zoomToBbox. zoomToBbox caps zoom at 100% and adds 10% padding, so zoomed-in captures would not replay as framed
- **Phase 1 starts with a viewport spike and is rated medium risk** — rejected: Treat viewport internals as known, low risk. Hidden-dependency critic: the spike doc has no viewport section
- **Slides and paths share one per-view Highlighter via a path-controller API** — rejected: A separate slide highlighter. Hidden-dependency critic: two highlighters would overwrite each other's ct-path-* classes and the 300ms data poll
- **Presentation captures keys before the canvas and blocks node select/drag/nudge** — rejected: Plain key listeners alongside canvas handling. Hidden-dependency critic: Space pans and arrows nudge nodes, and a nudge or selection saves the file, breaking Goal 4
- **Auto-play and key map are pure modules with fake-timer tests; a no-write test guards Goal 4** — rejected: Only judgment checks for auto-play and no-write. Success-criteria critic: both are mechanical properties a command can check
- **Per-slide paths stay in MVP with their own goal (Goal 5)** — rejected: Move per-slide paths to a later tier. Scope-creep critic flagged MVP work with no goal; John chose the feature, so a goal was added instead

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Slide model, viewport fit, internals
  └── Slides menu  (blocked by Slide model, viewport fit, internals)
        └── Presentation mode and auto-play  (blocked by Slides menu)
              └── Hands-on verification  (blocked by Presentation mode and auto-play)
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Canvas Presentation contract (canvas-presentation) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=3/3 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Sequential

1. **Phase 1** — Slide model, viewport fit, internals _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/canvas-presentation/spec-phase-1.md
   ```

2. **Phase 2** — Slides menu _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/canvas-presentation/spec-phase-2.md
   ```

3. **Phase 3** — Presentation mode and auto-play _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/canvas-presentation/spec-phase-3.md
   ```

4. **Phase 4** — Hands-on verification _(blocked by Presentation mode and auto-play)_

   ```bash
   # Review: Hands-on verification
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
