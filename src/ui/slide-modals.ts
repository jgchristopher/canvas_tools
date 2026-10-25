import { App, FuzzySuggestModal, Modal, Notice, Setting } from "obsidian";
import { DEFAULT_DURATION_SEC } from "../live-canvas/slide-model";

const MIN_DURATION_SEC = 1;
const MAX_DURATION_SEC = 3600;

// Resolves to seconds, `null` to clear back to the default, or `undefined`
// when cancelled.
export function promptDuration(app: App, current: number | undefined): Promise<number | null | undefined> {
	return new Promise((resolve) => new DurationModal(app, current, resolve).open());
}

export interface PathChoice {
	id: string | null; // null = "No path"
	label: string;
}

// Resolves to the chosen path id, `null` for "No path", or `undefined` when
// cancelled.
export function pickPath(app: App, choices: PathChoice[], currentLabel: string): Promise<string | null | undefined> {
	return new Promise((resolve) => new PathPicker(app, choices, currentLabel, resolve).open());
}

class DurationModal extends Modal {
	private value: string;
	private result: number | null | undefined = undefined;

	constructor(
		app: App,
		current: number | undefined,
		private readonly resolve: (value: number | null | undefined) => void,
	) {
		super(app);
		this.value = current === undefined ? "" : String(current);
		this.setTitle("Slide duration");
	}

	onOpen(): void {
		new Setting(this.contentEl)
			.setName("Seconds")
			.setDesc(`Leave blank for the default (${DEFAULT_DURATION_SEC}s).`)
			.addText((text) => {
				text.setPlaceholder(`Default (${DEFAULT_DURATION_SEC}s)`)
					.setValue(this.value)
					.onChange((v) => (this.value = v));
				text.inputEl.addEventListener("keydown", (evt) => {
					if (evt.key === "Enter") {
						evt.preventDefault();
						this.submit();
					}
				});
				window.setTimeout(() => text.inputEl.select(), 0);
			});
		new Setting(this.contentEl).addButton((btn) => btn.setButtonText("Save").setCta().onClick(() => this.submit()));
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolve(this.result);
	}

	private submit(): void {
		const raw = this.value.trim();
		if (!raw) {
			this.result = null;
			this.close();
			return;
		}
		const sec = Number(raw);
		if (!Number.isFinite(sec) || sec < MIN_DURATION_SEC || sec > MAX_DURATION_SEC) {
			new Notice(`Duration must be between ${MIN_DURATION_SEC} and ${MAX_DURATION_SEC} seconds.`);
			return;
		}
		this.result = sec;
		this.close();
	}
}

class PathPicker extends FuzzySuggestModal<PathChoice> {
	private chosen = false;

	constructor(
		app: App,
		private readonly choices: PathChoice[],
		currentLabel: string,
		private readonly resolve: (id: string | null | undefined) => void,
	) {
		super(app);
		this.setPlaceholder(`Highlight path for this slide (current: ${currentLabel})`);
		this.emptyStateText = "No matching paths";
		if (!choices.some((c) => c.id !== null)) {
			this.setInstructions([{ command: "", purpose: "No paths on this canvas" }]);
		}
	}

	getItems(): PathChoice[] {
		return this.choices;
	}

	getItemText(item: PathChoice): string {
		return item.label;
	}

	onChooseItem(item: PathChoice): void {
		this.chosen = true;
		this.resolve(item.id);
	}

	onClose(): void {
		super.onClose();
		// onChooseItem runs after onClose in Obsidian's suggest modals, so defer
		// the cancel resolution until the choice has had a chance to land.
		window.setTimeout(() => {
			if (!this.chosen) this.resolve(undefined);
		}, 0);
	}
}
