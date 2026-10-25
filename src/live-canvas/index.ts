import { FileView, Plugin, TFile } from "obsidian";
import { getLiveCanvas } from "./canvas-internals";
import { CanvasPathController } from "./controller";
import { SlidesController } from "./slides-controller";

export function registerLiveCanvas(plugin: Plugin): void {
	const { app } = plugin;
	// Paths and slides controllers are created and detached together per view;
	// slides drive highlights through the paths controller.
	interface ViewControllers {
		paths: CanvasPathController;
		slides: SlidesController;
		filePath: string | null;
	}
	const controllers = new Map<FileView, ViewControllers>();
	let warned = false;

	const detach = (view: FileView, pair: ViewControllers): void => {
		plugin.removeChild(pair.slides);
		plugin.removeChild(pair.paths);
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
			const paths = plugin.addChild(new CanvasPathController(app, view, canvas));
			const slides = plugin.addChild(new SlidesController(app, view, canvas, paths));
			controllers.set(view, { paths, slides, filePath: view.file?.path ?? null });
		}
		for (const [view, pair] of controllers) {
			if (!open.has(view)) detach(view, pair);
		}
	};

	const activeSlides = (): SlidesController | null => {
		const view = app.workspace.getActiveViewOfType(FileView);
		return (view && controllers.get(view)?.slides) ?? null;
	};
	const presentationCommand = (id: string, name: string, enabled: (s: SlidesController) => boolean, run: (s: SlidesController) => void) =>
		plugin.addCommand({
			id,
			name,
			checkCallback: (checking) => {
				const slides = activeSlides();
				if (!slides || !enabled(slides)) return false;
				if (!checking) run(slides);
				return true;
			},
		});
	presentationCommand(
		"start-presentation",
		"Start presentation",
		(s) => !s.isPresenting && s.currentDeck().slides.length > 0,
		(s) => s.startPresentation(false),
	);
	presentationCommand("stop-presentation", "Stop presentation", (s) => s.isPresenting, (s) => s.stopPresentation());
	presentationCommand("next-slide", "Next slide", (s) => s.isPresenting, (s) => s.presentationAct("next"));
	presentationCommand("previous-slide", "Previous slide", (s) => s.isPresenting, (s) => s.presentationAct("prev"));

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
			for (const pair of controllers.values()) {
				if (pair.filePath !== oldPath) continue;
				pair.filePath = file.path;
				pair.paths.filePath = file.path;
				pair.slides.filePath = file.path;
			}
		}),
	);
}
