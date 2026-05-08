import { App, TFile, requestUrl } from "obsidian";
import type { CanvasToolsSettings, LinkPreviewCacheEntry } from "../settings";
import type { AssetRef, LinkPreview } from "./canvas-types";
import { extensionOf, isImageExtension, mimeForImage } from "../utils/paths";
import { shortId } from "../utils/ids";

export interface AssetResolver {
	resolveImageFile(file: TFile): Promise<AssetRef>;
	resolveLinkPreview(url: string): Promise<LinkPreview | undefined>;
	getAsset(id: string): AssetRef | undefined;
	allAssets(): AssetRef[];
}

export interface AssetResolverDeps {
	app: App;
	settings: CanvasToolsSettings;
	saveSettings: () => Promise<void>;
}

const PREVIEW_TIMEOUT_MS = 3000;
const PREVIEW_TTL_MS = 1000 * 60 * 60 * 24 * 7; // one week

export function createAssetResolver(deps: AssetResolverDeps): AssetResolver {
	const assets = new Map<string, AssetRef>();
	const byVaultPath = new Map<string, AssetRef>();

	const remember = (asset: AssetRef): AssetRef => {
		assets.set(asset.id, asset);
		if (asset.vaultPath) byVaultPath.set(asset.vaultPath, asset);
		return asset;
	};

	return {
		async resolveImageFile(file) {
			const existing = byVaultPath.get(file.path);
			if (existing) return existing;
			const data = await deps.app.vault.adapter.readBinary(file.path);
			const ext = extensionOf(file.name);
			const mime = isImageExtension(ext) ? mimeForImage(ext) : "application/octet-stream";
			return remember({
				id: shortId("img"),
				kind: "image",
				vaultPath: file.path,
				mime,
				data,
			});
		},

		async resolveLinkPreview(url) {
			if (!deps.settings.fetchLinkPreviews) return undefined;
			const cached = deps.settings.linkPreviewCache[url];
			if (cached && Date.now() - cached.fetchedAt < PREVIEW_TTL_MS) {
				return previewFromCache(cached, remember);
			}
			const fetched = await tryFetchPreview(url);
			deps.settings.linkPreviewCache[url] = fetched ?? { fetchedAt: Date.now() };
			await deps.saveSettings();
			return fetched ? previewFromCache(fetched, remember) : undefined;
		},

		getAsset(id) {
			return assets.get(id);
		},

		allAssets() {
			return Array.from(assets.values());
		},
	};
}

function previewFromCache(
	entry: LinkPreviewCacheEntry,
	remember: (a: AssetRef) => AssetRef,
): LinkPreview {
	const preview: LinkPreview = {
		title: entry.title,
		description: entry.description,
	};
	if (entry.imageDataUri) {
		const decoded = decodeDataUri(entry.imageDataUri);
		if (decoded) {
			const asset = remember({
				id: shortId("img"),
				kind: "image",
				url: entry.imageDataUri,
				mime: decoded.mime,
				data: decoded.data,
			});
			preview.imageAssetId = asset.id;
		}
	}
	return preview;
}

function decodeDataUri(uri: string): { mime: string; data: ArrayBuffer } | undefined {
	const match = /^data:([^;]+);base64,(.+)$/.exec(uri);
	if (!match) return undefined;
	const mime = match[1];
	const b64 = match[2];
	if (!mime || !b64) return undefined;
	try {
		const bin = atob(b64);
		const buf = new ArrayBuffer(bin.length);
		const view = new Uint8Array(buf);
		for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
		return { mime, data: buf };
	} catch {
		return undefined;
	}
}

async function tryFetchPreview(url: string): Promise<LinkPreviewCacheEntry | undefined> {
	try {
		const res = await Promise.race([
			requestUrl({ url, method: "GET", throw: false }),
			timeoutAfter(PREVIEW_TIMEOUT_MS),
		]);
		if (res.status >= 400) return { fetchedAt: Date.now() };
		const html = res.text;
		const meta = extractMeta(html);
		const entry: LinkPreviewCacheEntry = { fetchedAt: Date.now() };
		if (meta.title) entry.title = meta.title;
		if (meta.description) entry.description = meta.description;
		if (meta.image) {
			const imageUri = await fetchImageAsDataUri(absolute(meta.image, url));
			if (imageUri) entry.imageDataUri = imageUri;
		}
		return entry;
	} catch {
		return { fetchedAt: Date.now() };
	}
}

function timeoutAfter(ms: number): Promise<never> {
	return new Promise((_, reject) => {
		window.setTimeout(() => reject(new Error("link preview timed out")), ms);
	});
}

function extractMeta(html: string): { title?: string; description?: string; image?: string } {
	const out: { title?: string; description?: string; image?: string } = {};
	const ogTitle = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
	const ogDesc = /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html);
	const ogImage = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html);
	const titleTag = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
	const descTag = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html);
	if (ogTitle?.[1]) out.title = decodeEntities(ogTitle[1]);
	else if (titleTag?.[1]) out.title = decodeEntities(titleTag[1]);
	if (ogDesc?.[1]) out.description = decodeEntities(ogDesc[1]);
	else if (descTag?.[1]) out.description = decodeEntities(descTag[1]);
	if (ogImage?.[1]) out.image = ogImage[1];
	return out;
}

function decodeEntities(input: string): string {
	return input
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'");
}

function absolute(url: string, base: string): string {
	try {
		return new URL(url, base).toString();
	} catch {
		return url;
	}
}

async function fetchImageAsDataUri(url: string): Promise<string | undefined> {
	try {
		const res = await requestUrl({ url, method: "GET", throw: false });
		if (res.status >= 400) return undefined;
		const ct = res.headers["content-type"] ?? res.headers["Content-Type"] ?? "image/png";
		const mime = ct.split(";")[0]?.trim() ?? "image/png";
		const bytes = new Uint8Array(res.arrayBuffer);
		let bin = "";
		for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] ?? 0);
		const b64 = btoa(bin);
		return `data:${mime};base64,${b64}`;
	} catch {
		return undefined;
	}
}
