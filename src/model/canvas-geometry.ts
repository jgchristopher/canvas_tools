import type {
	Bounds,
	CanvasEdge,
	CanvasNode,
	CanvasSide,
	RawCanvasEdge,
} from "./canvas-types";

export function computeBounds(nodes: CanvasNode[]): Bounds {
	if (nodes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const n of nodes) {
		if (n.x < minX) minX = n.x;
		if (n.y < minY) minY = n.y;
		if (n.x + n.w > maxX) maxX = n.x + n.w;
		if (n.y + n.h > maxY) maxY = n.y + n.h;
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function inferSide(
	self: CanvasNode | undefined,
	other: CanvasNode | undefined,
	role: "from" | "to",
): CanvasSide {
	if (!self || !other) return role === "from" ? "right" : "left";
	const selfCenterX = self.x + self.w / 2;
	const selfCenterY = self.y + self.h / 2;
	const otherCenterX = other.x + other.w / 2;
	const otherCenterY = other.y + other.h / 2;
	const dx = otherCenterX - selfCenterX;
	const dy = otherCenterY - selfCenterY;
	if (Math.abs(dx) > Math.abs(dy)) {
		return dx >= 0 ? "right" : "left";
	}
	return dy >= 0 ? "bottom" : "top";
}

export function normalizeEdge(raw: RawCanvasEdge, nodes: CanvasNode[]): CanvasEdge {
	const fromNode = nodes.find((n) => n.id === raw.fromNode);
	const toNode = nodes.find((n) => n.id === raw.toNode);
	const fromSide = raw.fromSide ?? inferSide(fromNode, toNode, "from");
	const toSide = raw.toSide ?? inferSide(toNode, fromNode, "to");
	return {
		id: raw.id,
		from: { node: raw.fromNode, side: fromSide },
		to: { node: raw.toNode, side: toSide },
		label: raw.label,
		color: raw.color,
		toEnd: raw.toEnd ?? "arrow",
		fromEnd: raw.fromEnd ?? "none",
	};
}
