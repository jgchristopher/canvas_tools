import type {
	CanvasEdge,
	CanvasModel,
	CanvasNode,
	CanvasSide,
	FileNode,
	GroupNode,
	LinkNode,
	TextNode,
} from "../../model/canvas-types";
import type { ExcalidrawMarkdown } from "../../settings";

export interface ExcalidrawDocument {
	type: "excalidraw";
	version: 2;
	source: string;
	elements: ExcalidrawElement[];
	appState: { gridSize: null; viewBackgroundColor: string };
	files: Record<string, ExcalidrawFile>;
}

export interface ExcalidrawFile {
	mimeType: string;
	id: string;
	dataURL: string;
	created: number;
}

export type ExcalidrawElement =
	| ExcRectangle
	| ExcText
	| ExcArrow
	| ExcImage;

interface ExcBase {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	angle: number;
	strokeColor: string;
	backgroundColor: string;
	fillStyle: "solid" | "hachure" | "cross-hatch";
	strokeWidth: number;
	strokeStyle: "solid" | "dashed" | "dotted";
	roughness: number;
	opacity: number;
	groupIds: string[];
	frameId: null;
	index: string;
	roundness: { type: 3 } | null;
	seed: number;
	version: number;
	versionNonce: number;
	isDeleted: false;
	boundElements: Array<{ id: string; type: "text" | "arrow" }> | null;
	updated: number;
	link: string | null;
	locked: boolean;
	customData: null;
}

interface ExcRectangle extends ExcBase {
	type: "rectangle";
}

interface ExcText extends ExcBase {
	type: "text";
	text: string;
	fontSize: number;
	fontFamily: number;
	textAlign: "left" | "center";
	verticalAlign: "top" | "middle";
	baseline: number;
	containerId: string | null;
	originalText: string;
	lineHeight: number;
	autoResize: boolean;
}

interface ExcArrow extends ExcBase {
	type: "arrow";
	points: Array<[number, number]>;
	lastCommittedPoint: null;
	startBinding: { elementId: string; focus: number; gap: number } | null;
	endBinding: { elementId: string; focus: number; gap: number } | null;
	startArrowhead: "arrow" | null;
	endArrowhead: "arrow" | null;
	elbowed: false;
}

interface ExcImage extends ExcBase {
	type: "image";
	fileId: string;
	status: "saved";
	scale: [1, 1];
	crop: null;
}

export interface MappingOptions {
	markdown: ExcalidrawMarkdown;
}

export function mapCanvasToExcalidraw(model: CanvasModel, opts: MappingOptions): ExcalidrawDocument {
	const elements: ExcalidrawElement[] = [];
	const files: Record<string, ExcalidrawFile> = {};
	const ts = Date.now();

	// Build groupIds map: which group(s) does each non-group node belong to?
	const groupNodes = model.nodes.filter((n): n is GroupNode => n.kind === "group");
	const memberGroups = new Map<string, string[]>();
	for (const node of model.nodes) {
		if (node.kind === "group") continue;
		const groups = groupNodes
			.filter((g) => contains(g, node))
			.map((g) => g.id);
		if (groups.length > 0) memberGroups.set(node.id, groups);
	}

	let zIndex = 0;
	const nextIndex = (): string => `a${(zIndex++).toString(36).padStart(3, "0")}`;

	const sortedNodes = [...model.nodes].sort((a, b) => weightFor(a) - weightFor(b));

	for (const node of sortedNodes) {
		const groups = node.kind === "group" ? [node.id] : memberGroups.get(node.id) ?? [];
		switch (node.kind) {
			case "group":
				elements.push(makeGroupRect(node, groups, ts, nextIndex()));
				break;
			case "text":
				pushTextLikeElements(elements, node, opts, groups, ts, nextIndex);
				break;
			case "file":
				pushFileNodeElements(elements, files, node, model, opts, groups, ts, nextIndex);
				break;
			case "link":
				pushLinkElements(elements, node, opts, groups, ts, nextIndex);
				break;
		}
	}

	const focusMap = buildFocusMap(model.edges, model.nodes);
	const elementsById = new Map<string, ExcalidrawElement>(elements.map((e) => [e.id, e] as const));
	for (const edge of model.edges) {
		const arrow = makeArrow(edge, model, ts, nextIndex(), focusMap);
		if (!arrow) continue;
		if (edge.label) {
			const labelId = `${edge.id}-label`;
			const label = makeArrowLabel(labelId, edge.id, edge.label, ts, nextIndex());
			arrow.boundElements = [{ id: labelId, type: "text" }];
			elements.push(arrow, label);
		} else {
			elements.push(arrow);
		}
		// Excalidraw requires a reciprocal entry on the bound shape: without
		// the arrow showing up in the rectangle's boundElements list, the
		// binding is treated as orphaned and the arrow renders unattached.
		registerArrowOnTarget(elementsById, arrow.startBinding?.elementId, arrow.id);
		registerArrowOnTarget(elementsById, arrow.endBinding?.elementId, arrow.id);
	}

	return {
		type: "excalidraw",
		version: 2,
		source: "canvas-tools",
		elements,
		appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
		files,
	};
}

function weightFor(node: CanvasNode): number {
	return node.kind === "group" ? 0 : 1;
}

function registerArrowOnTarget(
	elementsById: Map<string, ExcalidrawElement>,
	targetId: string | undefined,
	arrowId: string,
): void {
	if (!targetId) return;
	const target = elementsById.get(targetId);
	if (!target) return;
	const existing = target.boundElements ?? [];
	if (existing.some((e) => e.id === arrowId)) return;
	target.boundElements = [...existing, { id: arrowId, type: "arrow" }];
}

function contains(group: GroupNode, node: CanvasNode): boolean {
	if (node.id === group.id) return false;
	const cx = node.x + node.w / 2;
	const cy = node.y + node.h / 2;
	return cx >= group.x && cx <= group.x + group.w && cy >= group.y && cy <= group.y + group.h;
}

function baseElement(ts: number, index: string): ExcBase {
	return {
		id: "",
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		angle: 0,
		strokeColor: "#1e1e1e",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 2,
		strokeStyle: "solid",
		roughness: 1,
		opacity: 100,
		groupIds: [],
		frameId: null,
		index,
		roundness: { type: 3 },
		seed: rand(),
		version: 1,
		versionNonce: rand(),
		isDeleted: false,
		boundElements: null,
		updated: ts,
		link: null,
		locked: false,
		customData: null,
	};
}

function makeGroupRect(node: GroupNode, groups: string[], ts: number, index: string): ExcRectangle {
	return {
		...baseElement(ts, index),
		type: "rectangle",
		id: node.id,
		x: node.x,
		y: node.y,
		width: node.w,
		height: node.h,
		strokeColor: colorFor(node.color, "#666666"),
		backgroundColor: "transparent",
		strokeStyle: "dashed",
		roundness: { type: 3 },
		groupIds: groups,
	};
}

function pushTextLikeElements(
	out: ExcalidrawElement[],
	node: TextNode,
	opts: MappingOptions,
	groups: string[],
	ts: number,
	nextIndex: () => string,
): void {
	const rect: ExcRectangle = {
		...baseElement(ts, nextIndex()),
		type: "rectangle",
		id: node.id,
		x: node.x,
		y: node.y,
		width: node.w,
		height: node.h,
		strokeColor: colorFor(node.color, "#1e1e1e"),
		backgroundColor: "#ffffff",
		groupIds: groups,
	};
	const textId = `${node.id}-text`;
	const textValue = renderTextForExcalidraw(node.rawMarkdown, opts.markdown);
	const text = makeBoundText(textId, rect.id, textValue, node, groups, ts, nextIndex());
	rect.boundElements = [{ id: textId, type: "text" }];
	out.push(rect, text);
}

function pushFileNodeElements(
	out: ExcalidrawElement[],
	files: Record<string, ExcalidrawFile>,
	node: FileNode,
	model: CanvasModel,
	opts: MappingOptions,
	groups: string[],
	ts: number,
	nextIndex: () => string,
): void {
	if (node.imageAssetId) {
		const asset = model.assets.find((a) => a.id === node.imageAssetId);
		if (asset) {
			const fileId = `file-${asset.id}`;
			files[fileId] = {
				mimeType: asset.mime,
				id: fileId,
				dataURL: bufferToDataUri(asset.mime, asset.data),
				created: ts,
			};
			out.push({
				...baseElement(ts, nextIndex()),
				type: "image",
				id: node.id,
				x: node.x,
				y: node.y,
				width: node.w,
				height: node.h,
				groupIds: groups,
				fileId,
				status: "saved",
				scale: [1, 1],
				crop: null,
			});
			return;
		}
	}
	const rect: ExcRectangle = {
		...baseElement(ts, nextIndex()),
		type: "rectangle",
		id: node.id,
		x: node.x,
		y: node.y,
		width: node.w,
		height: node.h,
		strokeColor: colorFor(node.color, "#1e1e1e"),
		backgroundColor: "#ffffff",
		groupIds: groups,
	};
	const textId = `${node.id}-text`;
	const label = node.missing ? `Missing: ${node.filePath}` : node.filePath;
	const text = makeBoundText(textId, rect.id, label, node, groups, ts, nextIndex());
	rect.boundElements = [{ id: textId, type: "text" }];
	out.push(rect, text);
	void opts;
}

function pushLinkElements(
	out: ExcalidrawElement[],
	node: LinkNode,
	opts: MappingOptions,
	groups: string[],
	ts: number,
	nextIndex: () => string,
): void {
	void opts;
	const rect: ExcRectangle = {
		...baseElement(ts, nextIndex()),
		type: "rectangle",
		id: node.id,
		x: node.x,
		y: node.y,
		width: node.w,
		height: node.h,
		strokeColor: colorFor(node.color, "#1e1e1e"),
		backgroundColor: "#ffffff",
		groupIds: groups,
		link: node.url,
	};
	const textId = `${node.id}-text`;
	const label = node.preview?.title ?? node.url;
	const text = makeBoundText(textId, rect.id, label, node, groups, ts, nextIndex());
	rect.boundElements = [{ id: textId, type: "text" }];
	out.push(rect, text);
}

interface NodeRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

function makeBoundText(
	id: string,
	containerId: string,
	value: string,
	rect: NodeRect,
	groups: string[],
	ts: number,
	index: string,
): ExcText {
	const fontSize = 20;
	const lineHeight = 1.25;
	return {
		...baseElement(ts, index),
		type: "text",
		id,
		x: rect.x + 6,
		y: rect.y + 6,
		width: Math.max(0, rect.w - 12),
		height: Math.max(0, rect.h - 12),
		text: value,
		fontSize,
		fontFamily: 1,
		textAlign: "left",
		verticalAlign: "top",
		baseline: Math.round(fontSize * 0.9),
		containerId,
		originalText: value,
		lineHeight,
		autoResize: false,
		groupIds: groups,
	};
}

function makeArrow(
	edge: CanvasEdge,
	model: CanvasModel,
	ts: number,
	index: string,
	focusMap: Map<string, number>,
): ExcArrow | undefined {
	const fromNode = model.nodes.find((n) => n.id === edge.from.node);
	const toNode = model.nodes.find((n) => n.id === edge.to.node);
	if (!fromNode || !toNode) return undefined;
	const startFocus = focusMap.get(`${edge.id}:start`) ?? 0;
	const endFocus = focusMap.get(`${edge.id}:end`) ?? 0;
	const start = sideAnchor(fromNode, edge.from.side, startFocus);
	const end = sideAnchor(toNode, edge.to.side, endFocus);
	return {
		...baseElement(ts, index),
		type: "arrow",
		id: edge.id,
		x: start.x,
		y: start.y,
		width: end.x - start.x,
		height: end.y - start.y,
		strokeColor: edge.color ? colorFor(edge.color, "#1e1e1e") : "#1e1e1e",
		points: [
			[0, 0],
			[end.x - start.x, end.y - start.y],
		],
		lastCommittedPoint: null,
		startBinding: { elementId: fromNode.id, focus: startFocus, gap: gapFor(edge.from.side) },
		endBinding: { elementId: toNode.id, focus: endFocus, gap: gapFor(edge.to.side) },
		startArrowhead: edge.fromEnd === "arrow" ? "arrow" : null,
		endArrowhead: edge.toEnd === "arrow" ? "arrow" : null,
		elbowed: false,
	};
}

function makeArrowLabel(
	id: string,
	arrowId: string,
	label: string,
	ts: number,
	index: string,
): ExcText {
	const fontSize = 16;
	return {
		...baseElement(ts, index),
		type: "text",
		id,
		x: 0,
		y: 0,
		width: Math.max(40, label.length * fontSize * 0.55),
		height: fontSize * 1.4,
		text: label,
		fontSize,
		fontFamily: 1,
		textAlign: "center",
		verticalAlign: "middle",
		baseline: Math.round(fontSize * 0.9),
		containerId: arrowId,
		originalText: label,
		lineHeight: 1.25,
		autoResize: true,
		groupIds: [],
	};
}

// Distributes binding focus values along a node's side when multiple edges
// share the same (node, side). Edges are ordered by the position of the
// other endpoint along the side's perpendicular axis, so connectors fan out
// without crossing each other.
function buildFocusMap(edges: CanvasEdge[], nodes: CanvasNode[]): Map<string, number> {
	const nodeMap = new Map<string, CanvasNode>(nodes.map((n) => [n.id, n] as const));
	type Bucket = { key: string; coord: number };
	const buckets = new Map<string, Bucket[]>();
	const push = (sideKey: string, key: string, coord: number): void => {
		const list = buckets.get(sideKey) ?? [];
		list.push({ key, coord });
		buckets.set(sideKey, list);
	};
	for (const edge of edges) {
		const fromNode = nodeMap.get(edge.from.node);
		const toNode = nodeMap.get(edge.to.node);
		if (!fromNode || !toNode) continue;
		push(`${edge.from.node}:${edge.from.side}`, `${edge.id}:start`, perpCoord(toNode, edge.from.side));
		push(`${edge.to.node}:${edge.to.side}`, `${edge.id}:end`, perpCoord(fromNode, edge.to.side));
	}
	const map = new Map<string, number>();
	for (const list of buckets.values()) {
		list.sort((a, b) => a.coord - b.coord);
		const n = list.length;
		list.forEach((entry, i) => {
			const focus = n === 1 ? 0 : ((i / (n - 1)) * 2 - 1) * 0.7;
			map.set(entry.key, focus);
		});
	}
	return map;
}

function perpCoord(node: CanvasNode, side: CanvasSide): number {
	if (side === "left" || side === "right") return node.y + node.h / 2;
	return node.x + node.w / 2;
}

function sideAnchor(node: CanvasNode, side: CanvasSide, focus: number): { x: number; y: number } {
	// focus is in [-1, 1] along the bound side. Excalidraw recomputes the actual
	// attachment from the binding once the file loads, but providing a sensible
	// initial point keeps the arrow geometry stable when the plugin is opened.
	const along = (focus + 1) / 2; // map [-1,1] to [0,1]
	switch (side) {
		case "top":
			return { x: node.x + node.w * along, y: node.y };
		case "right":
			return { x: node.x + node.w, y: node.y + node.h * along };
		case "bottom":
			return { x: node.x + node.w * along, y: node.y + node.h };
		case "left":
			return { x: node.x, y: node.y + node.h * along };
	}
}

function gapFor(_side: CanvasSide): number {
	return 1;
}

function colorFor(color: string | undefined, fallback: string): string {
	if (!color) return fallback;
	if (/^[1-6]$/.test(color)) {
		const map: Record<string, string> = {
			"1": "#e34a4a",
			"2": "#d18a3e",
			"3": "#d6c14a",
			"4": "#4cb05a",
			"5": "#4d9bd9",
			"6": "#a06bd9",
		};
		return map[color] ?? fallback;
	}
	return color;
}

function rand(): number {
	return Math.floor(Math.random() * 0x7fffffff);
}

function bufferToDataUri(mime: string, data: ArrayBuffer): string {
	const bytes = new Uint8Array(data);
	let bin = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
		bin += String.fromCharCode.apply(null, Array.from(slice));
	}
	return `data:${mime};base64,${btoa(bin)}`;
}

export function renderTextForExcalidraw(markdown: string, mode: ExcalidrawMarkdown): string {
	if (mode === "preserve") return markdown;
	return stripMarkdown(markdown);
}

function stripMarkdown(input: string): string {
	return input
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/\*(.+?)\*/g, "$1")
		.replace(/__(.+?)__/g, "$1")
		.replace(/_(.+?)_/g, "$1")
		.replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/^>\s?/gm, "")
		.replace(/^[\s-]*[-*+]\s+/gm, "• ")
		.trim();
}
