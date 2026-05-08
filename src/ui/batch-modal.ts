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

export class BatchExportModal extends Modal {
	private readonly plugin: CanvasToolsPlugin;
	private readonly canvasFiles: TFile[];
	private readonly selected = new Set<string>();
	private target: Target = "html";
	private packaging: HtmlPackaging;
	private excalidrawMarkdown: ExcalidrawMarkdown;
	private excalidrawFormat: ExcalidrawFormat;
	private outputPath: string;
	private outputPathMode: OutputPathMode;

	constructor(app: App, plugin: CanvasToolsPlugin) {
		super(app);
		this.plugin = plugin;
		this.canvasFiles = app.vault.getFiles().filter((f) => f.extension === "canvas").sort((a, b) => a.path.localeCompare(b.path));
		const s = plugin.settings;
		this.packaging = s.defaultHtmlPackaging;
		this.excalidrawMarkdown = s.defaultExcalidrawMarkdown;
		this.excalidrawFormat = s.defaultExcalidrawFormat;
		this.outputPath = s.defaultOutputPath;
		this.outputPathMode = s.outputPathMode;
	}

	onOpen(): void {
		this.titleEl.setText("Batch export canvases");
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		if (this.canvasFiles.length === 0) {
			contentEl.createEl("p", { text: "No .canvas files found in this vault." });
			new Setting(contentEl).addButton((btn) => btn.setButtonText("Close").onClick(() => this.close()));
			return;
		}

		new Setting(contentEl)
			.setName("Target")
			.addDropdown((dd) =>
				dd
					.addOption("html", "HTML")
					.addOption("excalidraw", "Excalidraw")
					.setValue(this.target)
					.onChange((value) => {
						this.target = value as Target;
						this.render();
					}),
			);

		if (this.target === "html") {
			new Setting(contentEl).setName("Packaging").addDropdown((dd) =>
				dd
					.addOption("folder", "Folder with assets")
					.addOption("single-file", "Single file")
					.setValue(this.packaging)
					.onChange((value) => {
						this.packaging = value as HtmlPackaging;
					}),
			);
		} else {
			new Setting(contentEl).setName("Markdown handling").addDropdown((dd) =>
				dd
					.addOption("strip", "Strip syntax")
					.addOption("preserve", "Preserve source")
					.setValue(this.excalidrawMarkdown)
					.onChange((value) => {
						this.excalidrawMarkdown = value as ExcalidrawMarkdown;
					}),
			);
			new Setting(contentEl).setName("Format").addDropdown((dd) =>
				dd
					.addOption("obsidian-md", "Obsidian Excalidraw `.md`")
					.addOption("raw", "Raw `.excalidraw`")
					.setValue(this.excalidrawFormat)
					.onChange((value) => {
						this.excalidrawFormat = value as ExcalidrawFormat;
					}),
			);
		}

		new Setting(contentEl).setName("Output path").addText((t) =>
			t.setValue(this.outputPath).onChange((value) => {
				this.outputPath = value;
			}),
		);
		new Setting(contentEl).setName("Path mode").addDropdown((dd) =>
			dd
				.addOption("vault-relative", "Vault-relative")
				.addOption("absolute", "Absolute")
				.setValue(this.outputPathMode)
				.onChange((value) => {
					this.outputPathMode = value as OutputPathMode;
				}),
		);

		const listHeader = new Setting(contentEl).setName(`Canvases (${this.selected.size}/${this.canvasFiles.length})`);
		listHeader.addButton((btn) =>
			btn.setButtonText("Select all").onClick(() => {
				for (const f of this.canvasFiles) this.selected.add(f.path);
				this.render();
			}),
		);
		listHeader.addButton((btn) =>
			btn.setButtonText("Clear").onClick(() => {
				this.selected.clear();
				this.render();
			}),
		);

		const listEl = contentEl.createDiv({ cls: "ct-batch-list" });
		for (const file of this.canvasFiles) {
			const row = listEl.createDiv({ cls: "ct-batch-row" });
			const cb = row.createEl("input", { type: "checkbox" });
			cb.checked = this.selected.has(file.path);
			cb.addEventListener("change", () => {
				if (cb.checked) this.selected.add(file.path);
				else this.selected.delete(file.path);
				listHeader.setName(`Canvases (${this.selected.size}/${this.canvasFiles.length})`);
			});
			row.createSpan({ text: file.path });
		}

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Export")
					.setCta()
					.onClick(() => void this.runBatch(btn.buttonEl)),
			);
	}

	private async runBatch(button: HTMLElement): Promise<void> {
		const targets = this.canvasFiles.filter((f) => this.selected.has(f.path));
		if (targets.length === 0) {
			new Notice("Select at least one canvas to export.");
			return;
		}
		button.setAttr("disabled", "true");
		const progress = new Notice(`Exporting 0 / ${targets.length}…`, 0);
		let done = 0;
		const errors: string[] = [];
		for (const file of targets) {
			try {
				await this.exportOne(file);
			} catch (err) {
				errors.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`);
			}
			done++;
			progress.setMessage(`Exporting ${done} / ${targets.length}…`);
		}
		progress.hide();
		if (errors.length === 0) {
			new Notice(`Exported ${done} / ${targets.length}.`);
		} else {
			new Notice(`Exported ${done - errors.length} / ${targets.length}. ${errors.length} failed; see console.`);
			console.warn("[canvas-tools] batch errors", errors);
		}
		this.close();
	}

	private async exportOne(file: TFile): Promise<void> {
		const deps = {
			app: this.app,
			settings: this.plugin.settings,
			saveSettings: () => this.plugin.saveSettings(),
		};
		if (this.target === "html") {
			await exportCanvasToHtml(file, deps, {
				packaging: this.packaging,
				outputPath: this.outputPath,
				outputPathMode: this.outputPathMode,
			});
		} else {
			await exportCanvasToExcalidraw(file, deps, {
				markdown: this.excalidrawMarkdown,
				format: this.excalidrawFormat,
				outputPath: this.outputPath,
				outputPathMode: this.outputPathMode,
			});
		}
	}
}
