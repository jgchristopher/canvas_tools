import type { Bounds, CanvasSide } from "../../model/canvas-types";

export interface Anchor {
	x: number;
	y: number;
}

export interface NodeGeometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface BezierPath {
	d: string;
	midX: number;
	midY: number;
}

export function anchorPoint(node: NodeGeometry, side: CanvasSide, bounds: Bounds): Anchor {
	const relX = node.x - bounds.x;
	const relY = node.y - bounds.y;
	switch (side) {
		case "top":
			return { x: relX + node.w / 2, y: relY };
		case "right":
			return { x: relX + node.w, y: relY + node.h / 2 };
		case "bottom":
			return { x: relX + node.w / 2, y: relY + node.h };
		case "left":
			return { x: relX, y: relY + node.h / 2 };
	}
}

export function bezierPath(a: Anchor, aSide: CanvasSide, b: Anchor, bSide: CanvasSide): BezierPath {
	const offset = Math.max(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.3);
	const c1 = controlPoint(a, aSide, offset);
	const c2 = controlPoint(b, bSide, offset);
	const midX = (a.x + 3 * c1.x + 3 * c2.x + b.x) / 8;
	const midY = (a.y + 3 * c1.y + 3 * c2.y + b.y) / 8;
	return { d: `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`, midX, midY };
}

export function controlPoint(p: Anchor, side: CanvasSide, offset: number): Anchor {
	switch (side) {
		case "top":
			return { x: p.x, y: p.y - offset };
		case "right":
			return { x: p.x + offset, y: p.y };
		case "bottom":
			return { x: p.x, y: p.y + offset };
		case "left":
			return { x: p.x - offset, y: p.y };
	}
}
