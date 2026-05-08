import type { CanvasModel } from "../../model/canvas-types";
import type { OutputWriter } from "../../utils/fs";
import { HTML_RUNTIME } from "./runtime";
import { HTML_STYLES } from "./styles";
import { renderModelToHtml } from "./renderer";

export interface FolderPackageResult {
	indexPath: string;
}

export async function packageAsFolder(
	model: CanvasModel,
	writer: OutputWriter,
	folderName: string,
	title: string,
): Promise<FolderPackageResult> {
	const imagePathFor = (assetId: string, ext: string): string => `${folderName}/assets/images/${assetId}.${ext}`;
	const rendered = renderModelToHtml(model, {
		imageHref: (asset) => `assets/images/${asset.id}.${guessExt(asset.mime)}`,
	});
	for (const id of rendered.assetIds) {
		const asset = model.assets.find((a) => a.id === id);
		if (!asset) continue;
		const ext = guessExt(asset.mime);
		await writer.writeBinary(imagePathFor(asset.id, ext), asset.data);
	}
	await writer.writeText(`${folderName}/assets/styles.css`, HTML_STYLES);
	await writer.writeText(`${folderName}/assets/runtime.js`, HTML_RUNTIME);
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="assets/styles.css"></head><body><div class="ct-viewport">${rendered.body}</div><script src="assets/runtime.js"></script></body></html>`;
	const indexPath = `${folderName}/index.html`;
	await writer.writeText(indexPath, html);
	return { indexPath };
}

function guessExt(mime: string): string {
	if (mime === "image/jpeg") return "jpg";
	if (mime === "image/svg+xml") return "svg";
	const slash = mime.indexOf("/");
	return slash >= 0 ? mime.slice(slash + 1) : "bin";
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
