import type { CanvasModel } from "../../model/canvas-types";
import type { OutputWriter } from "../../utils/fs";
import { HTML_RUNTIME } from "./runtime";
import { HTML_STYLES } from "./styles";
import { renderModelToHtml } from "./renderer";

export interface SinglePackageResult {
	filePath: string;
}

export async function packageAsSingleFile(
	model: CanvasModel,
	writer: OutputWriter,
	fileName: string,
	title: string,
): Promise<SinglePackageResult> {
	const dataUriCache = new Map<string, string>();
	const rendered = renderModelToHtml(model, {
		imageHref: (asset) => {
			const cached = dataUriCache.get(asset.id);
			if (cached) return cached;
			const uri = toDataUri(asset.mime, asset.data);
			dataUriCache.set(asset.id, uri);
			return uri;
		},
	});
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${HTML_STYLES}</style></head><body><div class="ct-viewport">${rendered.body}</div><script>${HTML_RUNTIME}</script></body></html>`;
	await writer.writeText(fileName, html);
	return { filePath: fileName };
}

function toDataUri(mime: string, data: ArrayBuffer): string {
	const bytes = new Uint8Array(data);
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
		bin += String.fromCharCode.apply(null, Array.from(slice));
	}
	return `data:${mime};base64,${btoa(bin)}`;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
