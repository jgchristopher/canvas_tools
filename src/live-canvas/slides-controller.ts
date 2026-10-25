import { App, Component, FileView, Menu, Notice, setIcon } from "obsidian";
import { confirmDelete, NameErrors, promptName } from "../ui/path-name-modal";
import { pickPath, promptDuration } from "../ui/slide-modals";
import { shortId } from "../utils/ids";
import { CONTROL_BUTTON_CLASS, CONTROL_GROUP_CLASS, LiveCanvas, ZOOM_LIMITS } from "./canvas-internals";
import type { CanvasPathController } from "./controller";
import {
	addSlide,
	deckPatch,
	deleteSlide,
	isValidRect,
	moveSlide,
	nextSlideName,
	readDeck,
	Rect,
	renameSlide,
	setSlideDuration,
	setSlidePath,
	Slide,
	SlideDeck,
	slideDuration,
	updateSlideRect,
} from "./slide-model";
import { fitRect } from "./viewport-fit";

// Slide names need not be unique, so only emptiness is rejected.
const SLIDE_NAME_ERRORS: NameErrors = { empty: "Slide name can't be empty." };

// One per open canvas view, next to the path controller: owns the Slides
// button and the deck stored in the canvas file. Highlights go through the
// path controller so there is only ever one highlighter per view.
export class SlidesController extends Component {
	filePath: string | null;
	private groupEl: HTMLElement | null = null;
	private warnedCorrupt = false;

	constructor(
		private readonly app: App,
		view: FileView,
		private readonly canvas: LiveCanvas,
		private readonly paths: CanvasPathController,
	) {
		super();
		this.filePath = view.file?.path ?? null;
	}

	onload(): void {
		const { controlsEl } = this.canvas;
		if (!controlsEl || !this.filePath) return;
		this.groupEl = controlsEl.createDiv({ cls: CONTROL_GROUP_CLASS });
		const button = this.groupEl.createDiv({
			cls: CONTROL_BUTTON_CLASS,
			attr: { "aria-label": "Slides", "data-tooltip-position": "left" },
		});
		setIcon(button, "presentation");
		this.registerDomEvent(button, "click", (evt) => this.openDeckMenu(evt));
	}

	onunload(): void {
		this.groupEl?.remove();
		this.groupEl = null;
	}

	currentDeck(): SlideDeck {
		const { deck, corrupt } = readDeck(this.canvas.readData());
		if (corrupt && !this.warnedCorrupt) {
			this.warnedCorrupt = true;
			new Notice("Couldn't read saved slides for this canvas. Starting fresh.");
		}
		return deck;
	}

	goTo(slide: Slide): void {
		this.paths.stopEditing();
		const screen = this.canvas.getScreenSize();
		if (screen.width > 0 && screen.height > 0) {
			this.canvas.setViewport(fitRect(slide.rect, screen, ZOOM_LIMITS), true);
		}
		const known = slide.pathId && this.paths.listPaths().some((p) => p.id === slide.pathId);
		this.paths.setActivePath(known ? (slide.pathId ?? null) : null);
	}

	private openDeckMenu(evt: MouseEvent): void {
		const deck = this.currentDeck();
		const readonly = this.canvas.isReadonly();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Add slide from current view")
				.setIcon("plus")
				.setDisabled(readonly)
				.onClick(() => this.addFromView()),
		);
		if (deck.slides.length) menu.addSeparator();
		deck.slides.forEach((slide, i) => {
			menu.addItem((item) =>
				item.setTitle(`${i + 1} · ${slide.name}`).onClick(() => this.openSlideMenu(evt, slide.id)),
			);
		});
		menu.addSeparator();
		// Wired up in phase 3.
		menu.addItem((item) => item.setTitle("Start presentation").setIcon("play").setDisabled(true));
		menu.addItem((item) => item.setTitle("Start auto-play").setIcon("timer").setDisabled(true));
		menu.showAtMouseEvent(evt);
	}

	private openSlideMenu(evt: MouseEvent, id: string): void {
		const deck = this.currentDeck();
		const index = deck.slides.findIndex((s) => s.id === id);
		const slide = deck.slides[index];
		if (!slide) return;
		const readonly = this.canvas.isReadonly();
		const pathName = slide.pathId
			? (this.paths.listPaths().find((p) => p.id === slide.pathId)?.name ?? "(missing path)")
			: "none";
		const menu = new Menu();
		menu.addItem((item) => item.setTitle("Go to").setIcon("scan").onClick(() => this.goTo(slide)));
		menu.addItem((item) =>
			item
				.setTitle("Update to current view")
				.setIcon("refresh-cw")
				.setDisabled(readonly)
				.onClick(() => {
					const rect = this.capturedRect();
					if (rect) this.mutate((d) => updateSlideRect(d, id, rect));
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle(`Highlight path… (${pathName})`)
				.setIcon("route")
				.setDisabled(readonly)
				.onClick(() => void this.choosePath(id)),
		);
		menu.addItem((item) =>
			item
				.setTitle(`Duration… (${slide.durationSec === undefined ? `default ${slideDuration(slide)}s` : `${slide.durationSec}s`})`)
				.setIcon("timer")
				.setDisabled(readonly)
				.onClick(() => void this.chooseDuration(slide)),
		);
		menu.addItem((item) =>
			item
				.setTitle("Rename…")
				.setIcon("text-cursor-input")
				.setDisabled(readonly)
				.onClick(() => void this.rename(slide)),
		);
		menu.addItem((item) =>
			item
				.setTitle("Move up")
				.setIcon("arrow-up")
				.setDisabled(readonly || index === 0)
				.onClick(() => this.mutate((d) => moveSlide(d, id, -1))),
		);
		menu.addItem((item) =>
			item
				.setTitle("Move down")
				.setIcon("arrow-down")
				.setDisabled(readonly || index === deck.slides.length - 1)
				.onClick(() => this.mutate((d) => moveSlide(d, id, 1))),
		);
		menu.addItem((item) =>
			item
				.setTitle("Delete…")
				.setIcon("trash")
				.setDisabled(readonly)
				.onClick(() => void this.remove(slide)),
		);
		menu.showAtMouseEvent(evt);
	}

	private addFromView(): void {
		const rect = this.capturedRect();
		if (rect) this.mutate((d) => addSlide(d, shortId("slide"), nextSlideName(d), rect));
	}

	// A hidden or collapsed canvas reports a zero-size view. Writing that would
	// make the whole deck unreadable, so refuse it.
	private capturedRect(): Rect | null {
		const rect = this.canvas.getViewportRect();
		if (isValidRect(rect)) return rect;
		new Notice("Couldn't read the current view. Make sure the canvas is visible and try again.");
		return null;
	}

	private async choosePath(id: string): Promise<void> {
		const choices = [
			{ id: null, label: "No path" },
			...this.paths.listPaths().map((p) => ({ id: p.id, label: p.name })),
		];
		const slide = this.currentDeck().slides.find((s) => s.id === id);
		const current = slide?.pathId
			? (this.paths.listPaths().find((p) => p.id === slide.pathId)?.name ?? "(missing path)")
			: "No path";
		const chosen = await pickPath(this.app, choices, current);
		if (chosen === undefined) return;
		this.mutate((d) => setSlidePath(d, id, chosen));
	}

	private async chooseDuration(slide: Slide): Promise<void> {
		const sec = await promptDuration(this.app, slide.durationSec);
		if (sec === undefined) return;
		this.mutate((d) => setSlideDuration(d, slide.id, sec));
	}

	private async rename(slide: Slide): Promise<void> {
		const name = await promptName(
			this.app,
			"Rename slide",
			slide.name,
			(n) => (n.trim() ? { ok: true, name: n.trim() } : { ok: false, reason: "empty" }),
			SLIDE_NAME_ERRORS,
		);
		if (!name) return;
		this.mutate((d) => renameSlide(d, slide.id, name));
	}

	private async remove(slide: Slide): Promise<void> {
		if (!(await confirmDelete(this.app, `Delete slide "${slide.name}"?`))) return;
		this.mutate((d) => deleteSlide(d, slide.id));
	}

	// Same write path as paths: through the open canvas's own save, as an
	// undo step, touching only the slides key.
	private mutate(change: (deck: SlideDeck) => SlideDeck): void {
		if (this.canvas.isReadonly()) return;
		try {
			const data = this.canvas.readData();
			this.canvas.writeData(deckPatch(data, change(readDeck(data).deck)));
		} catch (err) {
			console.error("Canvas Tools: failed to save slides", err);
			new Notice("Couldn't save slides for this canvas.");
		}
	}
}
