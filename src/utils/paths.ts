import type { CanvasToolsSettings } from "../settings";

export interface ResolvedOutputPath {
	mode: "vault" | "absolute";
	root: string; // either a vault-relative folder or an absolute file system folder
}

export function resolveOutputRoot(
	settings: CanvasToolsSettings,
	override?: { path: string; mode: CanvasToolsSettings["outputPathMode"] },
): ResolvedOutputPath {
	const path = (override?.path ?? settings.defaultOutputPath).trim();
	const mode = override?.mode ?? settings.outputPathMode;
	if (mode === "absolute") {
		return { mode: "absolute", root: path };
	}
	if (path === "." || path === "/" || path === "") {
		return { mode: "vault", root: "" };
	}
	return { mode: "vault", root: path.replace(/^\.\/?/, "").replace(/^\/+/, "").replace(/\/+$/, "") };
}

export function joinPath(...parts: string[]): string {
	return parts
		.map((p, i) => {
			if (i === 0) return p.replace(/\/+$/, "");
			return p.replace(/^\/+/, "").replace(/\/+$/, "");
		})
		.filter((p) => p.length > 0)
		.join("/");
}

export function extensionOf(filename: string): string {
	const dot = filename.lastIndexOf(".");
	return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function basename(path: string): string {
	const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	return idx >= 0 ? path.slice(idx + 1) : path;
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);
export function isImageExtension(ext: string): boolean {
	return IMAGE_EXTS.has(ext.toLowerCase());
}

export function mimeForImage(ext: string): string {
	const e = ext.toLowerCase();
	if (e === "jpg" || e === "jpeg") return "image/jpeg";
	if (e === "svg") return "image/svg+xml";
	return `image/${e}`;
}
