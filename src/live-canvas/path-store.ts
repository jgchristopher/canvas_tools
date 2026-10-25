import { safeFileSlug } from "../utils/ids";
import { CanvasPathSet, emptyPathSet, parsePathSet } from "./path-model";

// Subset of Obsidian's DataAdapter, so `app.vault.adapter` passes directly.
export interface PathFileAdapter {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	remove(path: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	mkdir(path: string): Promise<void>;
}

export interface LoadResult {
	set: CanvasPathSet;
	corrupt: boolean;
}

// Readable slug plus a hash of the full vault path, so same-named canvases
// in different folders get different files.
export function pathFileKey(canvasPath: string): string {
	const basename = canvasPath.split("/").pop() ?? canvasPath;
	return `${safeFileSlug(basename)}-${fnv1a(canvasPath)}`;
}

// One file per canvas, no cache: every load and update reads from disk so
// edits synced in from another machine are never overwritten by stale state.
export class PathStore {
	constructor(
		private readonly adapter: PathFileAdapter,
		private readonly dir: string,
	) {}

	async load(canvasPath: string): Promise<LoadResult> {
		const file = this.fileFor(canvasPath);
		if (!(await this.adapter.exists(file))) return { set: emptyPathSet(canvasPath), corrupt: false };
		const set = parsePathSet(await this.adapter.read(file), canvasPath);
		return set ? { set, corrupt: false } : { set: emptyPathSet(canvasPath), corrupt: true };
	}

	async update(canvasPath: string, change: (set: CanvasPathSet) => CanvasPathSet): Promise<CanvasPathSet> {
		if (!(await this.adapter.exists(this.dir))) await this.adapter.mkdir(this.dir);
		const { set, corrupt } = await this.load(canvasPath);
		const file = this.fileFor(canvasPath);
		if (corrupt) {
			await this.adapter.rename(file, `${this.dir}/${pathFileKey(canvasPath)}.corrupt-${Date.now()}.json`);
		}
		const next = change(set);
		await this.adapter.write(file, serialize(next));
		return next;
	}

	async renameCanvas(oldPath: string, newPath: string): Promise<void> {
		const oldFile = this.fileFor(oldPath);
		if (!(await this.adapter.exists(oldFile))) return;
		const newFile = this.fileFor(newPath);
		const { set, corrupt } = await this.load(oldPath);
		if (corrupt) {
			// Move the unreadable bytes as-is; the next update sets them aside.
			if (await this.adapter.exists(newFile)) await this.adapter.remove(newFile);
			await this.adapter.rename(oldFile, newFile);
			return;
		}
		await this.adapter.write(newFile, serialize({ ...set, canvasPath: newPath }));
		await this.adapter.remove(oldFile);
	}

	async deleteCanvas(canvasPath: string): Promise<void> {
		const file = this.fileFor(canvasPath);
		if (await this.adapter.exists(file)) await this.adapter.remove(file);
	}

	private fileFor(canvasPath: string): string {
		return `${this.dir}/${pathFileKey(canvasPath)}.json`;
	}
}

function serialize(set: CanvasPathSet): string {
	return JSON.stringify(set, null, "\t");
}

function fnv1a(input: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
