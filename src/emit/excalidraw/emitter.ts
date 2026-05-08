import { App, TFile } from "obsidian";
import { buildCanvasModel } from "../../model/canvas-model";
import type { CanvasToolsSettings, ExcalidrawFormat, ExcalidrawMarkdown, OutputPathMode } from "../../settings";
import { createAbsoluteWriter, createVaultWriter, OutputWriter } from "../../utils/fs";
import { resolveOutputRoot } from "../../utils/paths";
import { safeFileSlug } from "../../utils/ids";
import { mapCanvasToExcalidraw } from "./mapping";
import { wrapAsObsidianExcalidraw } from "./wrapper";

export interface ExcalidrawExportOptions {
	markdown?: ExcalidrawMarkdown;
	format?: ExcalidrawFormat;
	outputPath?: string;
	outputPathMode?: OutputPathMode;
}

export interface ExcalidrawExportResult {
	absolutePath: string;
	format: ExcalidrawFormat;
	mode: "vault" | "absolute";
}

export interface ExcalidrawExportDeps {
	app: App;
	settings: CanvasToolsSettings;
	saveSettings: () => Promise<void>;
}

export async function exportCanvasToExcalidraw(
	file: TFile,
	deps: ExcalidrawExportDeps,
	opts: ExcalidrawExportOptions = {},
): Promise<ExcalidrawExportResult> {
	const format = opts.format ?? deps.settings.defaultExcalidrawFormat;
	const markdown = opts.markdown ?? deps.settings.defaultExcalidrawMarkdown;
	const resolved = resolveOutputRoot(deps.settings, opts.outputPath
		? { path: opts.outputPath, mode: opts.outputPathMode ?? deps.settings.outputPathMode }
		: undefined);
	const writer = makeWriter(deps.app, resolved.mode, resolved.root);
	const model = await buildCanvasModel(file, deps);
	const document = mapCanvasToExcalidraw(model, { markdown });
	const slug = safeFileSlug(file.name);
	if (format === "raw") {
		const path = `${slug}.excalidraw`;
		await writer.writeText(path, JSON.stringify(document, null, 2));
		return { absolutePath: joinForDisplay(writer, path, resolved.mode), format, mode: resolved.mode };
	}
	const path = `${slug}.excalidraw.md`;
	await writer.writeText(path, wrapAsObsidianExcalidraw(document));
	return { absolutePath: joinForDisplay(writer, path, resolved.mode), format, mode: resolved.mode };
}

function makeWriter(app: App, mode: "vault" | "absolute", root: string): OutputWriter {
	return mode === "absolute" ? createAbsoluteWriter(root) : createVaultWriter(app, root);
}

function joinForDisplay(writer: OutputWriter, rel: string, mode: "vault" | "absolute"): string {
	const root = writer.rootDisplay();
	if (mode === "absolute") {
		return root.endsWith("/") ? `${root}${rel}` : `${root}/${rel}`;
	}
	return root === "/" ? rel : `${root}/${rel}`;
}
