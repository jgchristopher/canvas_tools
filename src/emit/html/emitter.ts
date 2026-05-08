import { App, TFile } from "obsidian";
import { buildCanvasModel } from "../../model/canvas-model";
import type { CanvasToolsSettings, HtmlPackaging, OutputPathMode } from "../../settings";
import { createAbsoluteWriter, createVaultWriter, OutputWriter } from "../../utils/fs";
import { resolveOutputRoot } from "../../utils/paths";
import { safeFileSlug } from "../../utils/ids";
import { packageAsFolder } from "./package-folder";
import { packageAsSingleFile } from "./package-single";

export interface HtmlExportOptions {
	packaging?: HtmlPackaging;
	outputPath?: string;
	outputPathMode?: OutputPathMode;
}

export interface HtmlExportResult {
	absolutePath: string;
	packaging: HtmlPackaging;
	mode: "vault" | "absolute";
}

export interface HtmlExportDeps {
	app: App;
	settings: CanvasToolsSettings;
	saveSettings: () => Promise<void>;
}

export async function exportCanvasToHtml(
	file: TFile,
	deps: HtmlExportDeps,
	opts: HtmlExportOptions = {},
): Promise<HtmlExportResult> {
	const packaging = opts.packaging ?? deps.settings.defaultHtmlPackaging;
	const resolved = resolveOutputRoot(deps.settings, opts.outputPath
		? { path: opts.outputPath, mode: opts.outputPathMode ?? deps.settings.outputPathMode }
		: undefined);
	const writer = makeWriter(deps.app, resolved.mode, resolved.root);
	const model = await buildCanvasModel(file, deps);
	const slug = safeFileSlug(file.name);
	const title = file.basename;
	if (packaging === "folder") {
		const result = await packageAsFolder(model, writer, slug, title);
		return {
			absolutePath: joinForDisplay(writer, result.indexPath, resolved.mode),
			packaging,
			mode: resolved.mode,
		};
	}
	const result = await packageAsSingleFile(model, writer, `${slug}.html`, title);
	return {
		absolutePath: joinForDisplay(writer, result.filePath, resolved.mode),
		packaging,
		mode: resolved.mode,
	};
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
