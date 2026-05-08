import type { TFile } from "obsidian";

export type CanvasSide = "top" | "right" | "bottom" | "left";
export type EdgeEnd = "arrow" | "none";

export interface RawCanvasFile {
	nodes?: RawCanvasNode[];
	edges?: RawCanvasEdge[];
}

export type RawCanvasNode = RawTextNode | RawFileNode | RawLinkNode | RawGroupNode;

export interface RawCanvasNodeBase {
	id: string;
	type: "text" | "file" | "link" | "group";
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}
export interface RawTextNode extends RawCanvasNodeBase {
	type: "text";
	text: string;
}
export interface RawFileNode extends RawCanvasNodeBase {
	type: "file";
	file: string;
	subpath?: string;
}
export interface RawLinkNode extends RawCanvasNodeBase {
	type: "link";
	url: string;
}
export interface RawGroupNode extends RawCanvasNodeBase {
	type: "group";
	label?: string;
	background?: string;
	backgroundStyle?: string;
}

export interface RawCanvasEdge {
	id: string;
	fromNode: string;
	fromSide?: CanvasSide;
	toNode: string;
	toSide?: CanvasSide;
	color?: string;
	label?: string;
	fromEnd?: EdgeEnd;
	toEnd?: EdgeEnd;
}

export interface CanvasModel {
	source: TFile;
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	bounds: Bounds;
	assets: AssetRef[];
}

export interface Bounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;

export interface BaseNode {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	color?: string;
}

export interface TextNode extends BaseNode {
	kind: "text";
	html: string;
	rawMarkdown: string;
}

export interface FileNode extends BaseNode {
	kind: "file";
	filePath: string;
	subpath?: string;
	html?: string;
	imageAssetId?: string;
	missing?: boolean;
}

export interface LinkNode extends BaseNode {
	kind: "link";
	url: string;
	preview?: LinkPreview;
}

export interface LinkPreview {
	title?: string;
	description?: string;
	imageAssetId?: string;
}

export interface GroupNode extends BaseNode {
	kind: "group";
	label: string;
	background?: string;
}

export interface CanvasEdge {
	id: string;
	from: { node: string; side: CanvasSide };
	to: { node: string; side: CanvasSide };
	label?: string;
	color?: string;
	toEnd: EdgeEnd;
	fromEnd: EdgeEnd;
}

export interface AssetRef {
	id: string;
	kind: "image";
	vaultPath?: string;
	url?: string;
	mime: string;
	data: ArrayBuffer;
}
