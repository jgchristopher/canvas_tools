export type HtmlPackaging = "single-file" | "folder";
export type ExcalidrawMarkdown = "strip" | "preserve";
export type ExcalidrawFormat = "obsidian-md" | "raw";
export type OutputPathMode = "vault-relative" | "absolute";

export interface CanvasToolsSettings {
	defaultOutputPath: string;
	outputPathMode: OutputPathMode;
	defaultHtmlPackaging: HtmlPackaging;
	defaultExcalidrawMarkdown: ExcalidrawMarkdown;
	defaultExcalidrawFormat: ExcalidrawFormat;
	fetchLinkPreviews: boolean;
	htmlInteractive: boolean;
	openHtmlAfterExport: boolean;
	linkPreviewCache: Record<string, LinkPreviewCacheEntry>;
}

export interface LinkPreviewCacheEntry {
	fetchedAt: number;
	title?: string;
	description?: string;
	imageDataUri?: string;
}

export const DEFAULT_SETTINGS: CanvasToolsSettings = {
	defaultOutputPath: "exports",
	outputPathMode: "vault-relative",
	defaultHtmlPackaging: "folder",
	defaultExcalidrawMarkdown: "strip",
	defaultExcalidrawFormat: "obsidian-md",
	fetchLinkPreviews: false,
	htmlInteractive: true,
	openHtmlAfterExport: true,
	linkPreviewCache: {},
};
