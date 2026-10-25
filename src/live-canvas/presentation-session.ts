import { Autoplay, Clock } from "./autoplay";
import { LiveCanvas, ZOOM_LIMITS } from "./canvas-internals";
import type { PresentationAction } from "./presentation-keys";
import { DEFAULT_DURATION_SEC, SlideDeck, slideDuration } from "./slide-model";
import { fitRect } from "./viewport-fit";

export type SessionCanvas = Pick<LiveCanvas, "getScreenSize" | "setViewport" | "deselectAll">;

export interface PathApi {
	setActivePath(id: string | null): void;
	stopEditing(): void;
	hasPath(id: string): boolean;
}

// Presentation state with no DOM. It moves the viewport and the path
// highlight and never touches canvas data, so presenting can't save the file.
export class PresentationSession {
	private current = 0;
	private done = false;
	private readonly autoplay: Autoplay;

	constructor(
		private readonly canvas: SessionCanvas,
		private readonly deck: SlideDeck, // snapshot taken at start
		private readonly paths: PathApi,
		clock: Clock,
		private readonly onChange: () => void,
	) {
		this.autoplay = new Autoplay(
			clock,
			(i) => {
				const slide = this.deck.slides[i];
				return (slide ? slideDuration(slide) : DEFAULT_DURATION_SEC) * 1000;
			},
			() => this.advance(),
		);
	}

	get index(): number {
		return this.current;
	}

	get count(): number {
		return this.deck.slides.length;
	}

	get playing(): boolean {
		return this.autoplay.playing;
	}

	get ended(): boolean {
		return this.done;
	}

	begin(startIndex: number, autoplay: boolean): void {
		this.paths.stopEditing();
		this.canvas.deselectAll();
		this.show(clampIndex(startIndex, this.count));
		if (autoplay) this.autoplay.start(this.current);
		this.onChange();
	}

	act(action: PresentationAction): void {
		if (this.done) return;
		const last = this.count - 1;
		switch (action) {
			case "next":
				this.manual(Math.min(this.current + 1, last));
				break;
			case "prev":
				this.manual(Math.max(this.current - 1, 0));
				break;
			case "first":
				this.manual(0);
				break;
			case "last":
				this.manual(last);
				break;
			case "toggle-play":
				if (this.autoplay.playing) this.autoplay.stop();
				else this.autoplay.start(this.current);
				break;
			case "exit":
				this.end();
				break;
		}
		this.onChange();
	}

	// Re-apply the current slide, e.g. after a window resize.
	refit(): void {
		if (!this.done) this.fitTo(this.current);
	}

	end(): void {
		if (this.done) return;
		this.done = true;
		this.autoplay.stop();
		this.paths.setActivePath(null);
	}

	private manual(index: number): void {
		this.autoplay.stop(); // any manual navigation pauses auto-play
		this.show(index);
	}

	// Auto-play wraps from the last slide to the first; manual next does not.
	private advance(): void {
		if (this.done || this.count === 0) return;
		this.show((this.current + 1) % this.count);
		this.autoplay.start(this.current);
		this.onChange();
	}

	private show(index: number): void {
		const slide = this.deck.slides[index];
		if (!slide) return;
		this.current = index;
		this.fitTo(index);
		this.paths.setActivePath(slide.pathId && this.paths.hasPath(slide.pathId) ? slide.pathId : null);
	}

	private fitTo(index: number): void {
		const slide = this.deck.slides[index];
		const screen = this.canvas.getScreenSize();
		// A hidden pane reports 0x0; there is no meaningful fit, so leave the view.
		if (!slide || screen.width <= 0 || screen.height <= 0) return;
		this.canvas.setViewport(fitRect(slide.rect, screen, ZOOM_LIMITS), true);
	}
}

function clampIndex(index: number, count: number): number {
	return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}
