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
	emptyPathSet,
	findPath,
	renamePath,
	toggleEdge,
} from "./path-model";
import type { PathStore } from "./path-store";

// One per open canvas view: owns the toolbar button, the active path, the
// highlighter, and edit mode. Active path lives in memory only.
export class CanvasPathController extends Component {
	filePath: string | null;
	private set: CanvasPathSet;
	private activeId: string | null = null;
	private highlighter: Highlighter | null = null;
	private editMode: EditMode | null = null;
	private groupEl: HTMLElement | null = null;
	private buttonEl: HTMLElement | null = null;
	private warnedCorrupt = false;
	// Store writes run one at a time so rapid taps can't race each other's
	// read-modify-write and drop a toggle.
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly app: App,
		private readonly view: FileView,
		private readonly canvas: LiveCanvas,
		private readonly store: PathStore,
	) {
		super();
		this.filePath = view.file?.path ?? null;
		this.set = emptyPathSet(this.filePath ?? "");
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
		this.registerDomEvent(button, "click", (evt) => void this.openMenu(evt));
		void this.refresh();
	}

	onunload(): void {
		this.groupEl?.remove();
		this.groupEl = null;
		this.buttonEl = null;
	}

	// Re-read from disk so paths edited on another machine show up.
	private async refresh(): Promise<void> {
		const path = this.view.file?.path;
		if (!path) return;
		try {
			const { set, corrupt } = await this.store.load(path);
			this.set = set;
			if (corrupt && !this.warnedCorrupt) {
				this.warnedCorrupt = true;
				new Notice("Couldn't read saved paths for this canvas. Starting fresh.");
			}
		} catch (err) {
			console.error("Canvas Tools: failed to load paths", err);
		}
		this.showActive();
	}

	private async openMenu(evt: MouseEvent): Promise<void> {
		await this.refresh();
		const active = this.activeId ? findPath(this.set, this.activeId) : undefined;
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("Show all edges")
				.setChecked(!active)
				.onClick(() => this.setActive(null)),
		);
		for (const path of this.set.paths) {
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
				.setDisabled(!active)
				.onClick(() => this.startEditing()),
		);
		menu.addItem((item) =>
			item
				.setTitle("New path…")
				.setIcon("plus")
				.onClick(() => void this.newPath()),
		);
		menu.addItem((item) =>
			item
				.setTitle("Rename active path…")
				.setIcon("text-cursor-input")
				.setDisabled(!active)
				.onClick(() => void this.renameActive()),
		);
		menu.addItem((item) =>
			item
				.setTitle("Delete active path…")
				.setIcon("trash")
				.setDisabled(!active)
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
		const path = this.activeId ? findPath(this.set, this.activeId) : undefined;
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
		const path = this.activeId ? findPath(this.set, this.activeId) : undefined;
		if (!path) return;
		this.stopEditing();
		this.editMode = this.addChild(
			new EditMode(
				this.canvas,
				path.name,
				(edgeId) => void this.mutate((s) => toggleEdge(s, path.id, edgeId)),
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
		const name = await promptPathName(this.app, "New path", "", (n) => checkPathName(this.set, n));
		if (!name) return;
		const id = shortId("path");
		await this.mutate((s) => addPath(s, id, name));
		if (!findPath(this.set, id)) return;
		this.setActive(id);
		this.startEditing();
	}

	private async renameActive(): Promise<void> {
		const path = this.activeId ? findPath(this.set, this.activeId) : undefined;
		if (!path) return;
		const name = await promptPathName(this.app, "Rename path", path.name, (n) => checkPathName(this.set, n, path.id));
		if (!name) return;
		const wasEditing = !!this.editMode;
		await this.mutate((s) => renamePath(s, path.id, name));
		if (wasEditing) this.startEditing(); // refresh the pill's label
	}

	private async deleteActive(): Promise<void> {
		const path = this.activeId ? findPath(this.set, this.activeId) : undefined;
		if (!path || !(await confirmDelete(this.app, path.name))) return;
		await this.mutate((s) => deletePath(s, path.id));
		this.setActive(null);
	}

	private mutate(change: (set: CanvasPathSet) => CanvasPathSet): Promise<void> {
		const run = async (): Promise<void> => {
			// Always the file's current path, so edits follow a rename.
			const path = this.view.file?.path;
			if (!path) return;
			try {
				this.set = await this.store.update(path, change);
			} catch (err) {
				console.error("Canvas Tools: failed to save paths", err);
				new Notice("Couldn't save paths for this canvas.");
			}
			this.showActive();
		};
		const next = this.queue.then(run, run);
		this.queue = next;
		return next;
	}
}
