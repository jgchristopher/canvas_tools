import { App, Component, FileView, Menu, Notice, setIcon } from "obsidian";
import { confirmDelete, promptPathName } from "../ui/path-name-modal";
import { shortId } from "../utils/ids";
import { CONTROL_BUTTON_CLASS, CONTROL_GROUP_CLASS, LiveCanvas } from "./canvas-internals";
import { EditMode } from "./edit-mode";
import { Highlighter } from "./highlighter";
import {
	addPath,
	CanvasPathSet,
	checkPathName,
	deletePath,
	findPath,
	pathSetPatch,
	readPathSet,
	renamePath,
	toggleEdge,
} from "./path-model";

// How often to check whether canvas data was replaced (undo, redo, or a
// reload from disk when sync brings in a newer version).
const DATA_POLL_MS = 300;

// One per open canvas view: owns the toolbar button, the active path, the
// highlighter, and edit mode. Path data lives in the canvas file itself and is
// always read live; only the active path id is kept here, in memory.
export class CanvasPathController extends Component {
	filePath: string | null;
	private activeId: string | null = null;
	private highlighter: Highlighter | null = null;
	private editMode: EditMode | null = null;
	private groupEl: HTMLElement | null = null;
	private buttonEl: HTMLElement | null = null;
	private warnedCorrupt = false;
	private lastData: unknown = null;

	constructor(
		private readonly app: App,
		view: FileView,
		private readonly canvas: LiveCanvas,
	) {
		super();
		this.filePath = view.file?.path ?? null;
	}

	onload(): void {
		const { controlsEl } = this.canvas;
		if (!controlsEl || !this.filePath) return;
		this.highlighter = this.addChild(new Highlighter(this.canvas));

		this.groupEl = controlsEl.createDiv({ cls: CONTROL_GROUP_CLASS });
		const button = (this.buttonEl = this.groupEl.createDiv({
			cls: CONTROL_BUTTON_CLASS,
			attr: { "aria-label": "Paths", "data-tooltip-position": "left" },
		}));
		setIcon(button, "route");
		this.registerDomEvent(button, "click", (evt) => this.openMenu(evt));

		this.lastData = this.canvas.readData();
		this.registerInterval(
			window.setInterval(() => {
				const data = this.canvas.readData();
				if (data === this.lastData) return;
				this.lastData = data;
				this.showActive();
			}, DATA_POLL_MS),
		);
	}

	onunload(): void {
		this.groupEl?.remove();
		this.groupEl = null;
		this.buttonEl = null;
	}

	private currentSet(): CanvasPathSet {
		const { set, corrupt } = readPathSet(this.canvas.readData());
		if (corrupt && !this.warnedCorrupt) {
			this.warnedCorrupt = true;
			new Notice("Couldn't read saved paths for this canvas. Starting fresh.");
		}
		return set;
	}

	private openMenu(evt: MouseEvent): void {
		const set = this.currentSet();
		const active = this.activeId ? findPath(set, this.activeId) : undefined;
		const readonly = this.canvas.isReadonly();
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Show all edges")
				.setChecked(!active)
				.onClick(() => this.setActive(null)),
		);
		for (const path of set.paths) {
			menu.addItem((item) =>
				item
					.setTitle(path.name)
					.setChecked(path.id === active?.id)
					.onClick(() => this.setActive(path.id === active?.id ? null : path.id)),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Edit edges of active path")
				.setIcon("pencil")
				.setDisabled(!active || readonly)
				.onClick(() => this.startEditing()),
		);
		menu.addItem((item) =>
			item
				.setTitle("New path…")
				.setIcon("plus")
				.setDisabled(readonly)
				.onClick(() => void this.newPath()),
		);
		menu.addItem((item) =>
			item
				.setTitle("Rename active path…")
				.setIcon("text-cursor-input")
				.setDisabled(!active || readonly)
				.onClick(() => void this.renameActive()),
		);
		menu.addItem((item) =>
			item
				.setTitle("Delete active path…")
				.setIcon("trash")
				.setDisabled(!active || readonly)
				.onClick(() => void this.deleteActive()),
		);
		menu.showAtMouseEvent(evt);
	}

	private setActive(id: string | null): void {
		this.stopEditing();
		this.activeId = id;
		this.showActive();
	}

	private showActive(): void {
		const path = this.activeId ? findPath(this.currentSet(), this.activeId) : undefined;
		if (!path) {
			this.activeId = null;
			this.stopEditing();
			this.highlighter?.clear();
		} else {
			this.highlighter?.show(new Set(path.edgeIds));
		}
		this.buttonEl?.toggleClass("is-active", !!path);
	}

	private startEditing(): void {
		const path = this.activeId ? findPath(this.currentSet(), this.activeId) : undefined;
		if (!path || this.canvas.isReadonly()) return;
		this.stopEditing();
		this.editMode = this.addChild(
			new EditMode(
				this.canvas,
				path.name,
				(edgeId) => this.mutate((s) => toggleEdge(s, path.id, edgeId)),
				() => this.stopEditing(),
			),
		);
	}

	private stopEditing(): void {
		if (!this.editMode) return;
		this.removeChild(this.editMode);
		this.editMode = null;
	}

	private async newPath(): Promise<void> {
		const name = await promptPathName(this.app, "New path", "", (n) => checkPathName(this.currentSet(), n));
		if (!name) return;
		const id = shortId("path");
		this.mutate((s) => addPath(s, id, name));
		if (!findPath(this.currentSet(), id)) return;
		this.setActive(id);
		this.startEditing();
	}

	private async renameActive(): Promise<void> {
		const path = this.activeId ? findPath(this.currentSet(), this.activeId) : undefined;
		if (!path) return;
		const name = await promptPathName(this.app, "Rename path", path.name, (n) =>
			checkPathName(this.currentSet(), n, path.id),
		);
		if (!name) return;
		const wasEditing = !!this.editMode;
		this.mutate((s) => renamePath(s, path.id, name));
		if (wasEditing) this.startEditing(); // refresh the pill's label
	}

	private async deleteActive(): Promise<void> {
		const path = this.activeId ? findPath(this.currentSet(), this.activeId) : undefined;
		if (!path || !(await confirmDelete(this.app, path.name))) return;
		this.mutate((s) => deletePath(s, path.id));
		this.setActive(null);
	}

	// Writes go through the open canvas's own save, so Obsidian's pending
	// saves, undo history, and file reloads all stay consistent.
	private mutate(change: (set: CanvasPathSet) => CanvasPathSet): void {
		if (this.canvas.isReadonly()) return;
		try {
			const data = this.canvas.readData();
			this.canvas.writeData(pathSetPatch(data, change(readPathSet(data).set)));
		} catch (err) {
			console.error("Canvas Tools: failed to save paths", err);
			new Notice("Couldn't save paths for this canvas.");
		}
		this.lastData = this.canvas.readData();
		this.showActive();
	}
}
