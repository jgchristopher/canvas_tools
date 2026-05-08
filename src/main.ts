import { Plugin } from "obsidian";
import { CanvasToolsSettings, DEFAULT_SETTINGS } from "./settings";
import { CanvasToolsSettingTab } from "./settings-tab";
import { registerCommands } from "./commands";
import { createApi, CanvasToolsAPI } from "./api";

export default class CanvasToolsPlugin extends Plugin {
	settings!: CanvasToolsSettings;
	api!: CanvasToolsAPI;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.api = createApi(this);
		registerCommands(this);
		this.addSettingTab(new CanvasToolsSettingTab(this.app, this));
	}

	onunload(): void {
		// All listeners go through this.register* helpers; nothing to do here.
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<CanvasToolsSettings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
