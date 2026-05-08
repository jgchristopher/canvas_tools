import { App, PluginSettingTab, Setting } from "obsidian";
import type CanvasToolsPlugin from "./main";

export class CanvasToolsSettingTab extends PluginSettingTab {
	plugin: CanvasToolsPlugin;

	constructor(app: App, plugin: CanvasToolsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Output").setHeading();

		new Setting(containerEl)
			.setName("Default output path")
			.setDesc("Where exports are written by default. Vault-relative paths are written into the vault; absolute paths use the desktop file system.")
			.addText((text) =>
				text
					.setPlaceholder("Exports")
					.setValue(this.plugin.settings.defaultOutputPath)
					.onChange(async (value) => {
						this.plugin.settings.defaultOutputPath = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Output path mode")
			.setDesc("How to interpret the default output path.")
			.addDropdown((dd) =>
				dd
					.addOption("vault-relative", "Vault-relative")
					.addOption("absolute", "Absolute")
					.setValue(this.plugin.settings.outputPathMode)
					.onChange(async (value) => {
						this.plugin.settings.outputPathMode = value as typeof this.plugin.settings.outputPathMode;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("HTML export").setHeading();

		new Setting(containerEl)
			.setName("Default packaging")
			.setDesc("Folder produces an `index.html` plus an assets folder. Single file inlines everything into one `.html` file.")
			.addDropdown((dd) =>
				dd
					.addOption("folder", "Folder with assets")
					.addOption("single-file", "Single file")
					.setValue(this.plugin.settings.defaultHtmlPackaging)
					.onChange(async (value) => {
						this.plugin.settings.defaultHtmlPackaging = value as typeof this.plugin.settings.defaultHtmlPackaging;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open after export")
			.setDesc("Open the HTML file in your default browser when the export completes.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.openHtmlAfterExport).onChange(async (value) => {
					this.plugin.settings.openHtmlAfterExport = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Fetch link previews")
			.setDesc("Fetch og:image and metadata for URL nodes during export. The only network request the plugin makes; off by default.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.fetchLinkPreviews).onChange(async (value) => {
					this.plugin.settings.fetchLinkPreviews = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Excalidraw export").setHeading();

		new Setting(containerEl)
			.setName("Markdown handling")
			.setDesc("Excalidraw text doesn't render `markdown`. Strip removes syntax, preserve keeps the raw source.")
			.addDropdown((dd) =>
				dd
					.addOption("strip", "Strip syntax")
					.addOption("preserve", "Preserve source")
					.setValue(this.plugin.settings.defaultExcalidrawMarkdown)
					.onChange(async (value) => {
						this.plugin.settings.defaultExcalidrawMarkdown = value as typeof this.plugin.settings.defaultExcalidrawMarkdown;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Output format")
			.setDesc("Obsidian Excalidraw `.md` wrapper integrates with the Excalidraw plugin. Raw `.excalidraw` is the bare format used by the standalone app.")
			.addDropdown((dd) =>
				dd
					.addOption("obsidian-md", "Obsidian Excalidraw `.md`")
					.addOption("raw", "Raw `.excalidraw`")
					.setValue(this.plugin.settings.defaultExcalidrawFormat)
					.onChange(async (value) => {
						this.plugin.settings.defaultExcalidrawFormat = value as typeof this.plugin.settings.defaultExcalidrawFormat;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Cache").setHeading();

		const cacheEntries = Object.keys(this.plugin.settings.linkPreviewCache).length;
		new Setting(containerEl)
			.setName("Link preview cache")
			.setDesc(`${cacheEntries} cached entries.`)
			.addButton((btn) =>
				btn.setButtonText("Clear cache").onClick(async () => {
					this.plugin.settings.linkPreviewCache = {};
					await this.plugin.saveSettings();
					this.display();
				}),
			);
	}
}
