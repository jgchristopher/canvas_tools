import { FileView, Plugin, TFile } from "obsidian";
import { getLiveCanvas } from "./canvas-internals";
import { CanvasPathController } from "./controller";

export function registerLiveCanvas(plugin: Plugin): void {
	const { app } = plugin;
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
			controllers.set(view, plugin.addChild(new CanvasPathController(app, view, canvas)));
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

	// Paths travel inside the canvas file, so a rename needs no data move.
	// Retarget open controllers so sync() keeps them (and the active
	// highlight) instead of rebuilding them for the "new" file.
	plugin.registerEvent(
		app.vault.on("rename", (file, oldPath) => {
			if (!(file instanceof TFile) || file.extension !== "canvas") return;
			for (const controller of controllers.values()) {
				if (controller.filePath === oldPath) controller.filePath = file.path;
			}
		}),
	);
}
