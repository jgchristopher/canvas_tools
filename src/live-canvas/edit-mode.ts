import { Component } from "obsidian";
import type { LiveCanvas } from "./canvas-internals";

const EDITING = "ct-path-editing";

// Events Obsidian's own edge handlers listen for. Blocked on edge targets so a
// tap only toggles membership, never selects, drags, or edits the edge.
const BLOCKED_EVENTS = ["pointerdown", "mousedown", "click", "dblclick", "contextmenu"] as const;

// Tap-to-toggle edge membership. Works the same for touch and mouse: no
// shift-click, hover, or right-click.
export class EditMode extends Component {
	private pillEl: HTMLElement | null = null;

	constructor(
		private readonly canvas: LiveCanvas,
		private readonly pathName: string,
		private readonly onToggle: (edgeId: string) => void,
		private readonly onDone: () => void,
	) {
		super();
	}

	onload(): void {
		const { root } = this.canvas;
		root.addClass(EDITING);

		const pill = (this.pillEl = root.createDiv({ cls: "ct-path-edit-pill" }));
		pill.createSpan({ text: `Editing ${this.pathName}` });
		const done = pill.createEl("button", { cls: "mod-cta", text: "Done" });
		this.registerDomEvent(done, "click", () => this.onDone());
		// Keep pill taps from starting a canvas pan or deselect.
		this.registerDomEvent(pill, "pointerdown", (evt) => evt.stopPropagation());

		for (const type of BLOCKED_EVENTS) {
			// Capture phase on the wrapper runs before the edge's own listeners.
			this.registerDomEvent(root, type, (evt) => this.intercept(evt), { capture: true });
		}
		this.registerDomEvent(window, "keydown", (evt) => {
			if (evt.key === "Escape") this.onDone();
		});
	}

	onunload(): void {
		this.pillEl?.remove();
		this.pillEl = null;
		this.canvas.root.removeClass(EDITING);
	}

	private intercept(evt: Event): void {
		const edge = this.canvas.edgeFromTarget(evt.target);
		if (!edge) return;
		evt.preventDefault();
		evt.stopImmediatePropagation();
		if (evt.type === "click") this.onToggle(edge.id);
	}
}
