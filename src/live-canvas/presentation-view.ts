import { App, Component, Scope, setIcon } from "obsidian";
import { windowClock } from "./autoplay";
import type { LiveCanvas } from "./canvas-internals";
import { isConsumedKey, keyAction, PresentationAction, shouldHandleKey } from "./presentation-keys";
import { PathApi, PresentationSession } from "./presentation-session";
import type { SlideDeck } from "./slide-model";

const PRESENTING = "ct-presenting";

// Events that would select, drag, resize, or edit a node or edge.
const BLOCKED_POINTER_EVENTS = ["pointerdown", "mousedown", "click", "dblclick", "contextmenu"] as const;

// DOM shell around PresentationSession: hides the canvas UI, shows the tap
// bar, and routes keys and taps to the session.
export class PresentationView extends Component {
	private readonly session: PresentationSession;
	private barEl: HTMLElement | null = null;
	private counterEl: HTMLElement | null = null;
	private playEl: HTMLElement | null = null;
	private scope: Scope | null = null;
	// Keys the keymap scope already acted on, so the window listener only acts
	// for keys the scope never saw (popout windows have their own keymap).
	private readonly handled = new WeakSet<KeyboardEvent>();

	constructor(
		private readonly app: App,
		private readonly canvas: LiveCanvas,
		deck: SlideDeck,
		paths: PathApi,
		private readonly startIndex: number,
		private readonly autoplay: boolean,
		private readonly isViewActive: () => boolean,
		private readonly onExit: () => void,
	) {
		super();
		this.session = new PresentationSession(canvas, deck, paths, windowClock, () => this.render());
	}

	onload(): void {
		const { root } = this.canvas;
		root.addClass(PRESENTING);
		this.buildBar(root);

		// Obsidian's keymap runs first (window capture, registered at startup);
		// a pushed scope gets first say among its handlers.
		this.scope = new Scope(this.app.scope);
		this.scope.register(null, null, (evt) => {
			const action = this.forUs(evt) ? keyAction(evt) : null;
			if (!action) return true;
			this.handled.add(evt);
			this.act(action);
			return false;
		});
		this.app.keymap.pushScope(this.scope);

		// Keep Space (hold-to-pan) and edit keys from reaching the canvas's own
		// window listener and element handlers. Registered on the canvas's own
		// window so popouts work too.
		const win = root.win;
		this.registerDomEvent(
			win,
			"keydown",
			(evt) => {
				if (!this.forUs(evt) || !isConsumedKey(evt)) return;
				evt.preventDefault();
				evt.stopImmediatePropagation();
				const action = keyAction(evt);
				if (action && !this.handled.has(evt)) this.act(action);
			},
			{ capture: true },
		);

		for (const type of BLOCKED_POINTER_EVENTS) {
			this.registerDomEvent(root, type, (evt) => this.blockItem(evt), { capture: true });
		}
		// A drag on empty canvas draws a selection box; clear it so nothing is
		// selected for a passed-through hotkey (cut, duplicate) to act on.
		this.registerDomEvent(root, "pointerup", () => this.canvas.deselectAll());
		this.registerDomEvent(win, "resize", () => this.session.refit());

		this.session.begin(this.startIndex, this.autoplay);
	}

	onunload(): void {
		this.session.end();
		if (this.scope) this.app.keymap.popScope(this.scope);
		this.scope = null;
		this.barEl?.remove();
		this.barEl = null;
		this.canvas.root.removeClass(PRESENTING);
	}

	act(action: PresentationAction): void {
		this.session.act(action);
	}

	private buildBar(root: HTMLElement): void {
		const bar = (this.barEl = root.createDiv({ cls: "ct-present-bar" }));
		this.registerDomEvent(bar, "pointerdown", (evt) => evt.stopPropagation());
		const button = (icon: string, label: string, action: PresentationAction): HTMLElement => {
			const el = bar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
			setIcon(el, icon);
			this.registerDomEvent(el, "click", () => this.act(action));
			return el;
		};
		button("chevron-left", "Previous slide", "prev");
		this.counterEl = bar.createSpan({ cls: "ct-present-counter" });
		button("chevron-right", "Next slide", "next");
		this.playEl = button("play", "Play", "toggle-play");
		button("x", "Exit presentation", "exit");
	}

	private forUs(evt: KeyboardEvent): boolean {
		const target = evt.target instanceof Node ? evt.target : null;
		const el = target instanceof HTMLElement ? target : (target?.parentElement ?? null);
		const doc = this.canvas.root.doc;
		return shouldHandleKey({
			// An open menu pushes its own keymap scope above ours, so its keys
			// (Esc to dismiss, arrows to move) must not also drive the slides.
			inModal: !!doc.querySelector(".modal-container, .menu"),
			editable: !!el && (el.isContentEditable || !!el.closest("input, textarea, select")),
			insideCanvas: !!target && this.canvas.root.contains(target),
			onBody: target === doc.body,
			viewActive: this.isViewActive(),
		});
	}

	private blockItem(evt: Event): void {
		if (this.barEl?.contains(evt.target as Node)) return;
		if (!this.canvas.isItemTarget(evt.target)) return;
		evt.preventDefault();
		evt.stopImmediatePropagation();
	}

	private render(): void {
		if (this.session.ended) {
			this.onExit();
			return;
		}
		this.counterEl?.setText(`${this.session.index + 1} / ${this.session.count}`);
		if (this.playEl) {
			setIcon(this.playEl, this.session.playing ? "pause" : "play");
			this.playEl.setAttr("aria-label", this.session.playing ? "Pause" : "Play");
		}
	}
}
