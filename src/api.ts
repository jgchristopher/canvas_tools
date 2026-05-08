import { TFile } from "obsidian";
import type CanvasToolsPlugin from "./main";
import {
	exportCanvasToHtml,
	HtmlExportOptions,
	HtmlExportResult,
} from "./emit/html/emitter";
import {
	exportCanvasToExcalidraw,
	ExcalidrawExportOptions,
	ExcalidrawExportResult,
} from "./emit/excalidraw/emitter";
import { buildCanvasModel } from "./model/canvas-model";
import type { CanvasModel } from "./model/canvas-types";

export interface CanvasToolsAPI {
	exportCanvasToHtml(file: TFile, opts?: HtmlExportOptions): Promise<HtmlExportResult>;
	exportCanvasToExcalidraw(file: TFile, opts?: ExcalidrawExportOptions): Promise<ExcalidrawExportResult>;
	buildModel(file: TFile): Promise<CanvasModel>;
}

export function createApi(plugin: CanvasToolsPlugin): CanvasToolsAPI {
	const deps = () => ({
		app: plugin.app,
		settings: plugin.settings,
		saveSettings: () => plugin.saveSettings(),
	});
	return {
		exportCanvasToHtml(file, opts) {
			return exportCanvasToHtml(file, deps(), opts);
		},
		exportCanvasToExcalidraw(file, opts) {
			return exportCanvasToExcalidraw(file, deps(), opts);
		},
		buildModel(file) {
			return buildCanvasModel(file, deps());
		},
	};
}
