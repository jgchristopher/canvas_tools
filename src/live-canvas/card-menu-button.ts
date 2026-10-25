import { Component, setIcon } from "obsidian";
import { CONTROL_BUTTON_CLASS, CONTROL_GROUP_CLASS, LiveCanvas } from "./canvas-internals";
import type { CardMenuVisibility } from "./card-menu";

const HIDDEN = "ct-hide-card-menu";

// Per-view control-bar button that toggles the global card menu setting and
// mirrors it onto this canvas with a CSS class.
export class CardMenuButton extends Component {
	private groupEl: HTMLElement | null = null;

	constructor(
		private readonly canvas: LiveCanvas,
		private readonly visibility: CardMenuVisibility,
	) {
		super();
	}

	onload(): void {
		const { controlsEl, root } = this.canvas;
		if (!controlsEl) return;
		this.groupEl = controlsEl.createDiv({ cls: CONTROL_GROUP_CLASS });
		const button = this.groupEl.createDiv({ cls: CONTROL_BUTTON_CLASS, attr: { "data-tooltip-position": "left" } });
		setIcon(button, "panel-bottom-close");
		this.registerDomEvent(button, "click", () => void this.visibility.toggle());

		const off = this.visibility.subscribe((hidden) => {
			root.toggleClass(HIDDEN, hidden);
			button.toggleClass("is-active", hidden);
			button.setAttr("aria-label", hidden ? "Show card menu" : "Hide card menu");
		});
		this.register(off);
	}

	onunload(): void {
		this.groupEl?.remove();
		this.groupEl = null;
		this.canvas.root.removeClass(HIDDEN);
	}
}
