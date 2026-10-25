// The only module that touches Obsidian's undocumented canvas objects.
// Shapes come from docs/superpowers/spikes/2026-10-24-canvas-internals.md
// (Obsidian 1.15.0). When an Obsidian update breaks this feature, fix it here.
import type { EdgeEnds } from "./path-model";
import type { Rect } from "./slide-model";
import type { Size, Viewport, ZoomLimits } from "./viewport-fit";

export interface LiveEdge extends EdgeEnds {
	els: Element[]; // line group, line-end group, label wrapper (if any)
}

export interface LiveNode {
	id: string;
	el: HTMLElement;
}

export interface LiveCanvas {
	root: HTMLElement; // capture listeners and the edit pill attach here
	observeEl: HTMLElement; // subtree changes when edges and nodes render
	controlsEl: HTMLElement | null;
	edges(): LiveEdge[];
	nodes(): LiveNode[];
	edgeFromTarget(target: EventTarget | null): LiveEdge | null;
	readData(): unknown; // canvas.data; a new object after every save, undo, and reload
	writeData(patch: Record<string, unknown>): void;
	isReadonly(): boolean;
	getViewportRect(): Rect;
	getScreenSize(): Size;
	setViewport(v: Viewport, animate: boolean): void; // never saves
	deselectAll(): void;
}

// log2 zoom bounds of the canvas frame loop (cC and cfe in Obsidian 1.15.0).
export const ZOOM_LIMITS: ZoomLimits = { min: -4, max: 1 };

export const CONTROL_GROUP_CLASS = "canvas-control-group mod-raised";
export const CONTROL_BUTTON_CLASS = "canvas-control-item";

interface RawEdge {
	id?: unknown;
	from?: { node?: { id?: unknown } };
	to?: { node?: { id?: unknown } };
	lineGroupEl?: unknown;
	lineEndGroupEl?: unknown;
	labelElement?: { wrapperEl?: unknown };
}

interface RawNode {
	id?: unknown;
	nodeEl?: unknown;
}

interface RawCanvas {
	edges?: unknown;
	nodes?: unknown;
	wrapperEl?: unknown;
	canvasEl?: unknown;
	canvasControlsEl?: unknown;
	data?: unknown;
	readonly?: unknown;
	requestSave?: unknown;
	canvasRect?: { width?: unknown; height?: unknown };
	getViewportBBox?: unknown;
	markViewportChanged?: unknown;
	deselectAll?: unknown;
	x?: number;
	y?: number;
	zoom?: number;
	tx?: number;
	ty?: number;
	tZoom?: number;
	zoomCenter?: unknown;
}

export function getLiveCanvas(view: unknown): LiveCanvas | null {
	if (!isObject(view)) return null;
	const canvas = (view as { canvas?: unknown }).canvas;
	if (!isObject(canvas)) return null;
	const raw = canvas as RawCanvas;
	if (!(raw.edges instanceof Map) || !(raw.nodes instanceof Map)) return null;
	if (!isEl(raw.wrapperEl) || !isEl(raw.canvasEl)) return null;
	if (!isObject(raw.data) || typeof raw.requestSave !== "function") return null;
	if (!isObject(raw.canvasRect) || typeof raw.getViewportBBox !== "function") return null;
	if (typeof raw.markViewportChanged !== "function" || typeof raw.deselectAll !== "function") return null;

	const edgeMap = raw.edges as Map<string, RawEdge>;
	const nodeMap = raw.nodes as Map<string, RawNode>;

	const edges = (): LiveEdge[] => {
		const out: LiveEdge[] = [];
		for (const e of edgeMap.values()) {
			const live = toLiveEdge(e);
			if (live) out.push(live);
		}
		return out;
	};

	return {
		root: raw.wrapperEl as HTMLElement,
		observeEl: raw.canvasEl as HTMLElement,
		controlsEl: isEl(raw.canvasControlsEl) ? (raw.canvasControlsEl as HTMLElement) : null,
		edges,
		nodes: () => {
			const out: LiveNode[] = [];
			for (const n of nodeMap.values()) {
				if (typeof n?.id === "string" && isEl(n.nodeEl)) out.push({ id: n.id, el: n.nodeEl as HTMLElement });
			}
			return out;
		},
		edgeFromTarget: (target) => {
			if (!target) return null;
			return edges().find((e) => e.els.some((el) => el.contains(target as Node))) ?? null;
		},
		readData: () => raw.data,
		writeData: (patch) => {
			if (!isObject(raw.data)) return;
			Object.assign(raw.data, patch);
			// requestSave(true) refreshes canvas.data from getData() (which spreads
			// unknown top-level keys back in), pushes an undo snapshot, and runs
			// the view's debounced save. The snapshot keeps undo consistent: undo
			// restores whole-canvas snapshots, so a write without one could be
			// silently reverted by undoing an earlier, unrelated edit.
			(raw.requestSave as (pushHistory: boolean) => void).call(canvas, true);
		},
		isReadonly: () => raw.readonly === true,
		getViewportRect: () => {
			const box = (raw.getViewportBBox as () => Partial<Rect> | undefined).call(canvas) ?? {};
			return { minX: Number(box.minX) || 0, minY: Number(box.minY) || 0, maxX: Number(box.maxX) || 0, maxY: Number(box.maxY) || 0 };
		},
		getScreenSize: () => {
			const { width, height } = raw.canvasRect ?? {};
			return { width: Number(width) || 0, height: Number(height) || 0 };
		},
		setViewport: (v, animate) => {
			// The frame loop eases x/y/zoom toward tx/ty/tZoom while the
			// viewport is marked changed; setting x/y/zoom too makes it a jump.
			raw.tx = v.x;
			raw.ty = v.y;
			raw.tZoom = v.zoom;
			raw.zoomCenter = null;
			if (!animate) {
				raw.x = v.x;
				raw.y = v.y;
				raw.zoom = v.zoom;
			}
			(raw.markViewportChanged as () => void).call(canvas);
		},
		deselectAll: () => (raw.deselectAll as () => void).call(canvas),
	};
}

function toLiveEdge(e: RawEdge | undefined): LiveEdge | null {
	if (!e || typeof e.id !== "string") return null;
	const fromNode = e.from?.node?.id;
	const toNode = e.to?.node?.id;
	if (typeof fromNode !== "string" || typeof toNode !== "string") return null;
	if (!isEl(e.lineGroupEl) || !isEl(e.lineEndGroupEl)) return null;
	const els = [e.lineGroupEl as Element, e.lineEndGroupEl as Element];
	const label = e.labelElement?.wrapperEl;
	if (isEl(label)) els.push(label as Element);
	return { id: e.id, fromNode, toNode, els };
}

function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

function isEl(value: unknown): boolean {
	return isObject(value) && typeof (value as { contains?: unknown }).contains === "function";
}
