export type PresentationAction = "next" | "prev" | "first" | "last" | "toggle-play" | "exit";

export interface KeyLike {
	key: string;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
}

// PageUp/PageDown are what presentation clickers send.
const ACTIONS: Record<string, PresentationAction> = {
	ArrowRight: "next",
	" ": "next",
	PageDown: "next",
	ArrowLeft: "prev",
	PageUp: "prev",
	Home: "first",
	End: "last",
	p: "toggle-play",
	P: "toggle-play",
	Escape: "exit",
};

// Keys the canvas would use to pan (Space) or edit a selection (arrows,
// Delete, Backspace). Swallowed while presenting even when they map to nothing.
const CANVAS_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Backspace", " "]);

export function keyAction(evt: KeyLike): PresentationAction | null {
	if (hasCommandModifier(evt)) return null; // leave Obsidian hotkeys alone
	return ACTIONS[evt.key] ?? null;
}

export function isConsumedKey(evt: KeyLike): boolean {
	if (hasCommandModifier(evt)) return false;
	return keyAction(evt) !== null || CANVAS_KEYS.has(evt.key);
}

function hasCommandModifier(evt: KeyLike): boolean {
	return evt.altKey || evt.ctrlKey || evt.metaKey;
}

export interface KeyContext {
	inModal: boolean; // a modal (command palette, prompt) or menu is open
	editable: boolean; // focus is in an input, textarea, or contenteditable
	insideCanvas: boolean; // the event target is inside the presenting canvas
	onBody: boolean; // nothing focused (target is document.body)
	viewActive: boolean; // the presenting canvas view is the active leaf
}

// Presentation keys only apply to the presenting canvas: never while a modal
// or text field has focus, and never for keys typed in another pane.
export function shouldHandleKey(ctx: KeyContext): boolean {
	if (ctx.inModal || ctx.editable) return false;
	return ctx.insideCanvas || (ctx.onBody && ctx.viewActive);
}
