import type { Rect } from "./slide-model";

// Obsidian's canvas viewport: center in canvas coordinates plus log2 scale.
export interface Viewport {
	x: number;
	y: number;
	zoom: number;
}

export interface Size {
	width: number;
	height: number;
}

// log2 zoom bounds the canvas frame loop clamps to.
export interface ZoomLimits {
	min: number;
	max: number;
}

// Same math as Canvas.getViewportBBox(): the visible rect is the center
// plus or minus half the screen size divided by the scale.
export function viewportToRect(v: Viewport, screen: Size): Rect {
	const scale = 2 ** v.zoom;
	const halfW = screen.width / scale / 2;
	const halfH = screen.height / scale / 2;
	return { minX: v.x - halfW, minY: v.y - halfH, maxX: v.x + halfW, maxY: v.y + halfH };
}

// Fit a rect to the screen with no padding and no 100% cap (unlike
// Canvas.zoomToBbox), so a captured view replays exactly as framed.
export function fitRect(rect: Rect, screen: Size, limits: ZoomLimits): Viewport {
	const x = (rect.minX + rect.maxX) / 2;
	const y = (rect.minY + rect.maxY) / 2;
	const width = Math.max(rect.maxX - rect.minX, 1);
	const height = Math.max(rect.maxY - rect.minY, 1);
	// A 0x0 screen (hidden pane) has no meaningful fit; callers must skip
	// setViewport in that case. This only keeps the result finite.
	if (screen.width <= 0 || screen.height <= 0) return { x, y, zoom: 0 };
	const scale = Math.min(screen.width / width, screen.height / height);
	const zoom = Math.min(Math.max(Math.log2(scale), limits.min), limits.max);
	return { x, y, zoom };
}
