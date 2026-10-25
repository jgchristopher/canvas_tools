import { FileView, Plugin, TFile } from "obsidian";
import { getLiveCanvas } from "./canvas-internals";
import { CanvasPathController } from "./controller";
import { PathStore } from "./path-store";

export function registerLiveCanvas(plugin: Plugin): void {
	const { app } = plugin;
	const store = new PathStore(app.vault.adapter, `${plugin.manifest.dir}/paths`);
	const controllers = new Map<FileView, CanvasPathController>();
	let warned = false;

	const detach = (view: FileView, controller: CanvasPathController): void => {
		plugin.removeChild(controller);
		controllers.delete(view);
	};

	const sync = (): void => {
		const open = new Set<FileView>();
		for (const leaf of app.workspace.getLeavesOfType("canvas")) {
			if (!(leaf.view instanceof FileView)) continue;
			const view = leaf.view;
			open.add(view);
			const existing = controllers.get(view);
			if (existing && existing.filePath === (view.file?.path ?? null)) continue;
			if (existing) detach(view, existing);

			const canvas = getLiveCanvas(view);
			if (!canvas) {
				if (!warned) console.warn("Canvas Tools: canvas internals not recognized, path highlighting is off.");
				warned = true;
				continue;
			}
			controllers.set(view, plugin.addChild(new CanvasPathController(app, view, canvas, store)));
		}
		for (const [view, controller] of controllers) {
			if (!open.has(view)) detach(view, controller);
		}
	};

	app.workspace.onLayoutReady(() => {
		sync();
		plugin.registerEvent(app.workspace.on("layout-change", sync));
		plugin.registerEvent(app.workspace.on("file-open", sync));
	});

	plugin.registerEvent(
		app.vault.on("rename", (file, oldPath) => {
			if (!(file instanceof TFile) || file.extension !== "canvas") return;
			// Retarget open controllers first so sync() keeps them (and the
			// active highlight) instead of rebuilding them for the "new" file.
			for (const controller of controllers.values()) {
				if (controller.filePath === oldPath) controller.filePath = file.path;
			}
			store.renameCanvas(oldPath, file.path).catch((err) => console.error("Canvas Tools: failed to move paths", err));
		}),
	);
	plugin.registerEvent(
		app.vault.on("delete", (file) => {
			if (!(file instanceof TFile) || file.extension !== "canvas") return;
			store.deleteCanvas(file.path).catch((err) => console.error("Canvas Tools: failed to delete paths", err));
		}),
	);
}
