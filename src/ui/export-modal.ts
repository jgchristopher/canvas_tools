import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type CanvasToolsPlugin from "../main";
import type {
	ExcalidrawFormat,
	ExcalidrawMarkdown,
	HtmlPackaging,
	OutputPathMode,
} from "../settings";
import { exportCanvasToHtml } from "../emit/html/emitter";
import { exportCanvasToExcalidraw } from "../emit/excalidraw/emitter";

type Target = "html" | "excalidraw";

interface DraftOptions {
	target: Target;
	packaging: HtmlPackaging;
	excalidrawMarkdown: ExcalidrawMarkdown;
	excalidrawFormat: ExcalidrawFormat;
	outputPath: string;
	outputPathMode: OutputPathMode;
	openAfterExport: boolean;
}

export class ExportModal extends Modal {
	private readonly plugin: CanvasToolsPlugin;
	private readonly file: TFile;
	private readonly draft: DraftOptions;
	private readonly initialTarget: Target;

	constructor(app: App, plugin: CanvasToolsPlugin, file: TFile, initialTarget: Target = "html") {
		super(app);
		this.plugin = plugin;
		this.file = file;
		this.initialTarget = initialTarget;
		const s = plugin.settings;
		this.draft = {
			target: initialTarget,
			packaging: s.defaultHtmlPackaging,
			excalidrawMarkdown: s.defaultExcalidrawMarkdown,
			excalidrawFormat: s.defaultExcalidrawFormat,
			outputPath: s.defaultOutputPath,
			outputPathMode: s.outputPathMode,
			openAfterExport: s.openHtmlAfterExport,
		};
	}

	onOpen(): void {
		this.titleEl.setText("Export canvas");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		new Setting(contentEl).setName("Canvas").setDesc(this.file.path);

		new Setting(contentEl)
			.setName("Target")
			.addDropdown((dd) =>
				dd
					.addOption("html", "HTML")
					.addOption("excalidraw", "Excalidraw")
					.setValue(this.draft.target)
					.onChange((value) => {
						this.draft.target = value as Target;
						this.render();
					}),
			);

		if (this.draft.target === "html") {
			new Setting(contentEl)
				.setName("Packaging")
				.addDropdown((dd) =>
					dd
						.addOption("folder", "Folder with assets")
						.addOption("single-file", "Single file")
						.setValue(this.draft.packaging)
						.onChange((value) => {
							this.draft.packaging = value as HtmlPackaging;
						}),
				);
			new Setting(contentEl)
				.setName("Open after export")
				.addToggle((t) =>
					t.setValue(this.draft.openAfterExport).onChange((value) => {
						this.draft.openAfterExport = value;
					}),
				);
		} else {
			new Setting(contentEl)
				.setName("Markdown handling")
				.setDesc("Excalidraw text doesn't render `markdown`.")
				.addDropdown((dd) =>
					dd
						.addOption("strip", "Strip syntax")
						.addOption("preserve", "Preserve source")
						.setValue(this.draft.excalidrawMarkdown)
						.onChange((value) => {
							this.draft.excalidrawMarkdown = value as ExcalidrawMarkdown;
						}),
				);
			new Setting(contentEl)
				.setName("Format")
				.addDropdown((dd) =>
					dd
						.addOption("obsidian-md", "Obsidian Excalidraw `.md`")
						.addOption("raw", "Raw `.excalidraw`")
						.setValue(this.draft.excalidrawFormat)
						.onChange((value) => {
							this.draft.excalidrawFormat = value as ExcalidrawFormat;
						}),
				);
		}

		new Setting(contentEl)
			.setName("Output path")
			.setDesc("Path mode below controls how this is interpreted.")
			.addText((text) =>
				text.setValue(this.draft.outputPath).onChange((value) => {
					this.draft.outputPath = value;
				}),
			);

		new Setting(contentEl)
			.setName("Path mode")
			.addDropdown((dd) =>
				dd
					.addOption("vault-relative", "Vault-relative")
					.addOption("absolute", "Absolute")
					.setValue(this.draft.outputPathMode)
					.onChange((value) => {
						this.draft.outputPathMode = value as OutputPathMode;
					}),
			);

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Export")
					.setCta()
					.onClick(() => void this.runExport(btn.buttonEl)),
			);

		// Suppress unused warning when the user never re-renders.
		void this.initialTarget;
	}

	private async runExport(button: HTMLElement): Promise<void> {
		const original = button.textContent ?? "Export";
		button.textContent = "Exporting…";
		button.setAttr("disabled", "true");
		try {
			const path = await this.performExport();
			new Notice(`Exported to ${path}`);
			this.close();
			if (this.draft.target === "html" && this.draft.openAfterExport) {
				await openInBrowser(path, this.draft.outputPathMode, this.app);
			}
		} catch (err) {
			console.error("[canvas-tools] export failed", err);
			new Notice(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
			button.textContent = original;
			button.removeAttribute("disabled");
		}
	}

	private async performExport(): Promise<string> {
		if (this.draft.target === "html") {
			const result = await exportCanvasToHtml(this.file, {
				app: this.app,
				settings: this.plugin.settings,
				saveSettings: () => this.plugin.saveSettings(),
			}, {
				packaging: this.draft.packaging,
				outputPath: this.draft.outputPath,
				outputPathMode: this.draft.outputPathMode,
			});
			return result.absolutePath;
		}
		const result = await exportCanvasToExcalidraw(this.file, {
			app: this.app,
			settings: this.plugin.settings,
			saveSettings: () => this.plugin.saveSettings(),
		}, {
			markdown: this.draft.excalidrawMarkdown,
			format: this.draft.excalidrawFormat,
			outputPath: this.draft.outputPath,
			outputPathMode: this.draft.outputPathMode,
		});
		return result.absolutePath;
	}
}

async function openInBrowser(path: string, mode: OutputPathMode, app: App): Promise<void> {
	if (mode === "absolute") {
		try {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const electron = require("electron") as { shell?: { openPath: (p: string) => Promise<string> } };
			if (electron.shell) {
				await electron.shell.openPath(path);
				return;
			}
		} catch {
			// fall through to opening as URL
		}
		window.open(`file://${path}`, "_blank");
		return;
	}
	const file = app.vault.getAbstractFileByPath(path);
	if (file && "extension" in file) {
		await app.workspace.openLinkText(path, "", false);
	} else {
		new Notice(`Open the exported file from your vault: ${path}`);
	}
}
