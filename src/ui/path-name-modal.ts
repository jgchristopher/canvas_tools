import { App, Modal, Notice, Setting } from "obsidian";
import type { NameCheck } from "../live-canvas/path-model";

// `duplicate` is only needed when `validate` can reject duplicates.
export interface NameErrors {
	empty: string;
	duplicate?: string;
}

export function promptName(
	app: App,
	title: string,
	initial: string,
	validate: (name: string) => NameCheck,
	errors: NameErrors,
): Promise<string | null> {
	return new Promise((resolve) => new NameModal(app, title, initial, validate, errors, resolve).open());
}

// `title` is the full question, e.g. 'Delete path "Route A"?'.
export function confirmDelete(app: App, title: string): Promise<boolean> {
	return new Promise((resolve) => new ConfirmDeleteModal(app, title, resolve).open());
}

class NameModal extends Modal {
	private value: string;
	private result: string | null = null;

	constructor(
		app: App,
		title: string,
		initial: string,
		private readonly validate: (name: string) => NameCheck,
		private readonly errors: NameErrors,
		private readonly resolve: (name: string | null) => void,
	) {
		super(app);
		this.value = initial;
		this.setTitle(title);
	}

	onOpen(): void {
		new Setting(this.contentEl).setName("Name").addText((text) => {
			text.setValue(this.value).onChange((v) => (this.value = v));
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
		const check = this.validate(this.value);
		if (!check.ok) {
			new Notice(this.errors[check.reason] ?? "Name not allowed.");
			return;
		}
		this.result = check.name;
		this.close();
	}
}

class ConfirmDeleteModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		title: string,
		private readonly resolve: (confirmed: boolean) => void,
	) {
		super(app);
		this.setTitle(title);
	}

	onOpen(): void {
		new Setting(this.contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Delete")
					.setWarning()
					.onClick(() => {
						this.confirmed = true;
						this.close();
					}),
			)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
		this.resolve(this.confirmed);
	}
}
