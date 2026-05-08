import { App, Component, MarkdownRenderer, TFile } from "obsidian";
import type {
	AssetRef,
	CanvasModel,
	CanvasNode,
	FileNode,
	GroupNode,
	LinkNode,
	RawCanvasFile,
	RawCanvasNode,
	RawFileNode,
	RawGroupNode,
	RawLinkNode,
	RawTextNode,
	TextNode,
} from "./canvas-types";
import { AssetResolver, createAssetResolver } from "./asset-resolver";
import { computeBounds, normalizeEdge } from "./canvas-geometry";
import type { CanvasToolsSettings } from "../settings";
import { extensionOf, isImageExtension } from "../utils/paths";

export interface BuildModelDeps {
	app: App;
	settings: CanvasToolsSettings;
	saveSettings: () => Promise<void>;
}

export async function buildCanvasModel(file: TFile, deps: BuildModelDeps): Promise<CanvasModel> {
	const raw = await readCanvasFile(deps.app, file);
	const resolver = createAssetResolver({
		app: deps.app,
		settings: deps.settings,
		saveSettings: deps.saveSettings,
	});

	const renderComponent = new Component();
	renderComponent.load();
	const renderRoot = createOffscreenRoot();

	try {
		const nodes = await Promise.all(
			(raw.nodes ?? []).map((node) =>
				normalizeNode(node, {
					app: deps.app,
					sourcePath: file.path,
					resolver,
					renderComponent,
					renderRoot,
				}),
			),
		);
		const edges = (raw.edges ?? []).map((edge) => normalizeEdge(edge, nodes));
		return {
			source: file,
			nodes,
			edges,
			bounds: computeBounds(nodes),
			assets: resolver.allAssets() satisfies AssetRef[],
		};
	} finally {
		renderRoot.remove();
		renderComponent.unload();
	}
}

async function readCanvasFile(app: App, file: TFile): Promise<RawCanvasFile> {
	const text = await app.vault.read(file);
	const trimmed = text.trim();
	if (!trimmed) return { nodes: [], edges: [] };
	const parsed: unknown = JSON.parse(trimmed);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error(`Canvas file ${file.path} is not a JSON object.`);
	}
	return parsed as RawCanvasFile;
}

function createOffscreenRoot(): HTMLDivElement {
	const root = document.createElement("div");
	root.classList.add("ct-offscreen-render");
	document.body.appendChild(root);
	return root;
}

interface NodeContext {
	app: App;
	sourcePath: string;
	resolver: AssetResolver;
	renderComponent: Component;
	renderRoot: HTMLDivElement;
}

async function normalizeNode(raw: RawCanvasNode, ctx: NodeContext): Promise<CanvasNode> {
	switch (raw.type) {
		case "text":
			return normalizeTextNode(raw, ctx);
		case "file":
			return normalizeFileNode(raw, ctx);
		case "link":
			return normalizeLinkNode(raw, ctx);
		case "group":
			return normalizeGroupNode(raw);
	}
}

async function normalizeTextNode(raw: RawTextNode, ctx: NodeContext): Promise<TextNode> {
	const html = await renderMarkdown(raw.text, ctx);
	return {
		kind: "text",
		id: raw.id,
		x: raw.x,
		y: raw.y,
		w: raw.width,
		h: raw.height,
		color: raw.color,
		html,
		rawMarkdown: raw.text,
	};
}

async function normalizeFileNode(raw: RawFileNode, ctx: NodeContext): Promise<FileNode> {
	const target = ctx.app.metadataCache.getFirstLinkpathDest(raw.file, ctx.sourcePath);
	const base: FileNode = {
		kind: "file",
		id: raw.id,
		x: raw.x,
		y: raw.y,
		w: raw.width,
		h: raw.height,
		color: raw.color,
		filePath: raw.file,
		subpath: raw.subpath,
	};
	if (!target) return { ...base, missing: true };
	const ext = extensionOf(target.name);
	if (isImageExtension(ext)) {
		const asset = await ctx.resolver.resolveImageFile(target);
		return { ...base, imageAssetId: asset.id };
	}
	const md = await ctx.app.vault.cachedRead(target);
	const html = await renderMarkdown(md, { ...ctx, sourcePath: target.path });
	return { ...base, html };
}

async function normalizeLinkNode(raw: RawLinkNode, ctx: NodeContext): Promise<LinkNode> {
	const preview = await ctx.resolver.resolveLinkPreview(raw.url);
	const node: LinkNode = {
		kind: "link",
		id: raw.id,
		x: raw.x,
		y: raw.y,
		w: raw.width,
		h: raw.height,
		color: raw.color,
		url: raw.url,
	};
	if (preview) node.preview = preview;
	return node;
}

function normalizeGroupNode(raw: RawGroupNode): GroupNode {
	return {
		kind: "group",
		id: raw.id,
		x: raw.x,
		y: raw.y,
		w: raw.width,
		h: raw.height,
		color: raw.color,
		label: raw.label ?? "",
		background: raw.background,
	};
}

async function renderMarkdown(source: string, ctx: NodeContext): Promise<string> {
	const wrapper = document.createElement("div");
	ctx.renderRoot.appendChild(wrapper);
	try {
		await MarkdownRenderer.render(ctx.app, source, wrapper, ctx.sourcePath, ctx.renderComponent);
		return wrapper.innerHTML;
	} finally {
		wrapper.remove();
	}
}

