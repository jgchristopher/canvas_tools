import { Notice, TAbstractFile, TFile } from "obsidian";
import type CanvasToolsPlugin from "../main";
import { ExportModal } from "../ui/export-modal";
import { BatchExportModal } from "../ui/batch-modal";

export function registerCommands(plugin: CanvasToolsPlugin): void {
	plugin.addRibbonIcon("layout-grid", "Export canvas", () => {
		const file = activeCanvasFile(plugin);
		if (!file) {
			new Notice("Open a .canvas file first.");
			return;
		}
		new ExportModal(plugin.app, plugin, file).open();
	});

	plugin.addCommand({
		id: "export-current-canvas-html",
		name: "Export current canvas to HTML",
		callback: () => {
			const file = activeCanvasFile(plugin);
			if (!file) {
				new Notice("Open a .canvas file first.");
				return;
			}
			new ExportModal(plugin.app, plugin, file, "html").open();
		},
	});

	plugin.addCommand({
		id: "export-current-canvas-excalidraw",
		name: "Export current canvas to Excalidraw",
		callback: () => {
			const file = activeCanvasFile(plugin);
			if (!file) {
				new Notice("Open a .canvas file first.");
				return;
			}
			new ExportModal(plugin.app, plugin, file, "excalidraw").open();
		},
	});

	plugin.addCommand({
		id: "batch-export-canvases",
		name: "Batch export canvases",
		callback: () => new BatchExportModal(plugin.app, plugin).open(),
	});

	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) => {
			if (!isCanvasFile(file)) return;
			menu.addItem((item) =>
				item
					.setTitle("Export canvas to HTML")
					.setIcon("file-code-2")
					.onClick(() => new ExportModal(plugin.app, plugin, file, "html").open()),
			);
			menu.addItem((item) =>
				item
					.setTitle("Export canvas to Excalidraw")
					.setIcon("pencil-ruler")
					.onClick(() => new ExportModal(plugin.app, plugin, file, "excalidraw").open()),
			);
		}),
	);
}

function activeCanvasFile(plugin: CanvasToolsPlugin): TFile | undefined {
	const file = plugin.app.workspace.getActiveFile();
	return file && file.extension === "canvas" ? file : undefined;
}

function isCanvasFile(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension === "canvas";
}
