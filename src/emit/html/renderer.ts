import type {
	AssetRef,
	CanvasModel,
	CanvasNode,
	FileNode,
	GroupNode,
	LinkNode,
	TextNode,
} from "../../model/canvas-types";
import { anchorPoint, bezierPath } from "./edge-geometry";

export interface RenderedHtml {
	body: string;
	assetIds: Set<string>;
}

export interface RenderOptions {
	imageHref: (asset: AssetRef) => string;
	interactive: boolean;
}

export function renderModelToHtml(model: CanvasModel, opts: RenderOptions): RenderedHtml {
	const used = new Set<string>();
	const sortedNodes = [...model.nodes].sort((a, b) => weightFor(a) - weightFor(b));
	const nodeHtml = sortedNodes
		.map((node) => renderNode(node, model, opts, used))
		.join("");
	const edgeSvg = renderEdges(model, opts.interactive);
	const bounds = model.bounds;
	const sidecar = opts.interactive ? renderStateSidecar(model) : "";
	const handlesAttr = opts.interactive ? ' data-interactive="true"' : "";
	const dataBounds = JSON.stringify(bounds);
	const body = `<div class="ct-canvas"${handlesAttr} data-bounds='${escapeAttr(dataBounds)}' style="width:${bounds.w}px;height:${bounds.h}px;">${edgeSvg}${nodeHtml}${sidecar}</div>`;
	return { body, assetIds: used };
}

function renderStateSidecar(model: CanvasModel): string {
	const state = {
		nodes: model.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, kind: n.kind })),
		edges: model.edges.map((e) => ({
			id: e.id,
			from: e.from,
			to: e.to,
			label: e.label,
			color: e.color,
			toEnd: e.toEnd,
			fromEnd: e.fromEnd,
		})),
		bounds: model.bounds,
	};
	const json = JSON.stringify(state).replace(/<\//g, "<\\/");
	return `<script type="application/json" id="ct-state">${json}</script>`;
}

function weightFor(node: CanvasNode): number {
	if (node.kind === "group") return 0;
	return 1;
}

function renderNode(node: CanvasNode, model: CanvasModel, opts: RenderOptions, used: Set<string>): string {
	const left = node.x - model.bounds.x;
	const top = node.y - model.bounds.y;
	const colorClass = node.color ? colorClassFor(node.color) : "";
	const baseStyle = `left:${left}px;top:${top}px;width:${node.w}px;height:${node.h}px;`;
	switch (node.kind) {
		case "text":
			return renderTextNode(node, baseStyle, colorClass);
		case "file":
			return renderFileNode(node, model, opts, used, baseStyle, colorClass);
		case "link":
			return renderLinkNode(node, model, opts, used, baseStyle, colorClass);
		case "group":
			return renderGroupNode(node, baseStyle, colorClass);
	}
}

function renderTextNode(node: TextNode, style: string, colorClass: string): string {
	return `<div class="ct-node ct-node-text ${colorClass}" data-id="${escapeAttr(node.id)}" style="${style}">${node.html}</div>`;
}

function renderFileNode(
	node: FileNode,
	model: CanvasModel,
	opts: RenderOptions,
	used: Set<string>,
	style: string,
	colorClass: string,
): string {
	if (node.missing) {
		return `<div class="ct-node ct-node-file ct-missing ${colorClass}" data-id="${escapeAttr(node.id)}" style="${style}">Missing: ${escapeHtml(node.filePath)}</div>`;
	}
	if (node.imageAssetId) {
		const asset = model.assets.find((a) => a.id === node.imageAssetId);
		if (asset) {
			used.add(asset.id);
			const href = opts.imageHref(asset);
			return `<div class="ct-node ct-node-file ct-image ${colorClass}" data-id="${escapeAttr(node.id)}" style="${style}"><img src="${escapeAttr(href)}" alt="${escapeAttr(node.filePath)}"></div>`;
		}
	}
	const html = node.html ?? `<em>${escapeHtml(node.filePath)}</em>`;
	return `<div class="ct-node ct-node-file ${colorClass}" data-id="${escapeAttr(node.id)}" style="${style}">${html}</div>`;
}

function renderLinkNode(
	node: LinkNode,
	model: CanvasModel,
	opts: RenderOptions,
	used: Set<string>,
	style: string,
	colorClass: string,
): string {
	const host = hostnameOf(node.url);
	let imageTag = "";
	if (node.preview?.imageAssetId) {
		const asset = model.assets.find((a) => a.id === node.preview?.imageAssetId);
		if (asset) {
			used.add(asset.id);
			imageTag = `<img class="ct-link-image" src="${escapeAttr(opts.imageHref(asset))}" alt="">`;
		}
	}
	const title = node.preview?.title ?? node.url;
	const desc = node.preview?.description ?? "";
	return `<div class="ct-node ct-node-link ${colorClass}" data-id="${escapeAttr(node.id)}" style="${style}"><a class="ct-link-card" href="${escapeAttr(node.url)}" target="_blank" rel="noopener noreferrer">${imageTag}<div class="ct-link-body"><div class="ct-link-title">${escapeHtml(title)}</div><div class="ct-link-host">${escapeHtml(host)}</div>${desc ? `<div class="ct-link-desc">${escapeHtml(desc)}</div>` : ""}</div></a></div>`;
}

function renderGroupNode(node: GroupNode, style: string, colorClass: string): string {
	const label = node.label ? `<div class="ct-group-label">${escapeHtml(node.label)}</div>` : "";
	return `<div class="ct-node ct-node-group ${colorClass}" data-id="${escapeAttr(node.id)}" style="${style}">${label}</div>`;
}

function renderEdges(model: CanvasModel, interactive: boolean): string {
	if (model.edges.length === 0) return "";
	const nodeMap = new Map(model.nodes.map((n) => [n.id, n] as const));
	const paths: string[] = [];
	const labels: string[] = [];
	const arrowsUsed = new Set<string>();
	for (const edge of model.edges) {
		const from = nodeMap.get(edge.from.node);
		const to = nodeMap.get(edge.to.node);
		if (!from || !to) continue;
		const start = anchorPoint(from, edge.from.side, model.bounds);
		const end = anchorPoint(to, edge.to.side, model.bounds);
		const path = bezierPath(start, edge.from.side, end, edge.to.side);
		const stroke = edge.color ? colorHex(edge.color) : "var(--ct-edge)";
		const markerEnd = edge.toEnd === "arrow" ? `marker-end="url(#${markerId(stroke, arrowsUsed)})"` : "";
		const markerStart = edge.fromEnd === "arrow" ? `marker-start="url(#${markerId(stroke, arrowsUsed)}-rev)"` : "";
		const dataId = interactive ? ` data-id="${escapeAttr(edge.id)}"` : "";
		paths.push(`<path${dataId} d="${path.d}" stroke="${stroke}" ${markerEnd} ${markerStart}></path>`);
		if (edge.label) {
			labels.push(`<text${dataId} class="ct-edge-label" x="${path.midX}" y="${path.midY}" text-anchor="middle" dominant-baseline="central">${escapeHtml(edge.label)}</text>`);
		}
	}
	const defs = buildArrowMarkers(arrowsUsed);
	const w = model.bounds.w;
	const h = model.bounds.h;
	return `<svg class="ct-edges" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${paths.join("")}${labels.join("")}</svg>`;
}

function markerId(stroke: string, used: Set<string>): string {
	const id = "ct-arrow-" + hashColor(stroke);
	used.add(stroke);
	return id;
}

function buildArrowMarkers(strokes: Set<string>): string {
	if (strokes.size === 0) return "";
	const markers: string[] = [];
	for (const stroke of strokes) {
		const id = "ct-arrow-" + hashColor(stroke);
		markers.push(
			`<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}"/></marker>`,
			`<marker id="${id}-rev" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 10 0 L 0 5 L 10 10 z" fill="${stroke}"/></marker>`,
		);
	}
	return `<defs>${markers.join("")}</defs>`;
}

function hashColor(stroke: string): string {
	let h = 0;
	for (let i = 0; i < stroke.length; i++) h = (h * 31 + stroke.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

function colorClassFor(color: string): string {
	if (/^[1-6]$/.test(color)) return `ct-color-${color}`;
	return "";
}

function colorHex(color: string): string {
	if (/^[1-6]$/.test(color)) {
		const map: Record<string, string> = {
			"1": "#e34a4a",
			"2": "#d18a3e",
			"3": "#d6c14a",
			"4": "#4cb05a",
			"5": "#4d9bd9",
			"6": "#a06bd9",
		};
		return map[color] ?? "var(--ct-edge)";
	}
	return color;
}

function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
