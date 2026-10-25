import { App, Modal, Notice, Setting } from "obsidian";
import type { NameCheck } from "../live-canvas/path-model";

const NAME_ERRORS: Record<"empty" | "duplicate", string> = {
	empty: "Path name can't be empty.",
	duplicate: "A path with that name already exists.",
};

export function promptPathName(
	app: App,
	title: string,
	initial: string,
	validate: (name: string) => NameCheck,
): Promise<string | null> {
	return new Promise((resolve) => new PathNameModal(app, title, initial, validate, resolve).open());
}

export function confirmDelete(app: App, pathName: string): Promise<boolean> {
	return new Promise((resolve) => new ConfirmDeleteModal(app, pathName, resolve).open());
}

class PathNameModal extends Modal {
	private value: string;
	private result: string | null = null;

	constructor(
		app: App,
		title: string,
		initial: string,
		private readonly validate: (name: string) => NameCheck,
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
			new Notice(NAME_ERRORS[check.reason]);
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
		pathName: string,
		private readonly resolve: (confirmed: boolean) => void,
	) {
		super(app);
		this.setTitle(`Delete path "${pathName}"?`);
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
