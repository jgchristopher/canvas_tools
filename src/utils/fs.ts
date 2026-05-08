import type { App } from "obsidian";

export interface OutputWriter {
	writeText(relativePath: string, contents: string): Promise<void>;
	writeBinary(relativePath: string, contents: ArrayBuffer): Promise<void>;
	rootDisplay(): string;
}

export function createVaultWriter(app: App, root: string): OutputWriter {
	const adapter = app.vault.adapter;
	const ensureDir = async (path: string): Promise<void> => {
		const parts = path.split("/").filter(Boolean);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await adapter.exists(current))) {
				await adapter.mkdir(current);
			}
		}
	};
	const fullPath = (rel: string): string => (root ? `${root}/${rel}` : rel);
	return {
		async writeText(relativePath, contents) {
			const full = fullPath(relativePath);
			const dir = full.split("/").slice(0, -1).join("/");
			if (dir) await ensureDir(dir);
			await adapter.write(full, contents);
		},
		async writeBinary(relativePath, contents) {
			const full = fullPath(relativePath);
			const dir = full.split("/").slice(0, -1).join("/");
			if (dir) await ensureDir(dir);
			await adapter.writeBinary(full, contents);
		},
		rootDisplay() {
			return root || "/";
		},
	};
}

export function createAbsoluteWriter(root: string): OutputWriter {
	// Lazy-loaded to avoid bundling node fs into mobile builds. The writer is only
	// constructed in absolute mode, which is desktop-only.
	type FsModule = {
		promises: {
			mkdir: (p: string, opts: { recursive: boolean }) => Promise<unknown>;
			writeFile: (p: string, data: string | Uint8Array) => Promise<void>;
		};
	};
	type PathModule = {
		join: (...parts: string[]) => string;
		dirname: (p: string) => string;
	};
	type OsModule = {
		homedir: () => string;
	};
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const fs = require("fs") as FsModule;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const path = require("path") as PathModule;
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const os = require("os") as OsModule;
	const expandedRoot = expandHome(root, os.homedir());
	return {
		async writeText(relativePath, contents) {
			const full = path.join(expandedRoot, relativePath);
			await fs.promises.mkdir(path.dirname(full), { recursive: true });
			await fs.promises.writeFile(full, contents);
		},
		async writeBinary(relativePath, contents) {
			const full = path.join(expandedRoot, relativePath);
			await fs.promises.mkdir(path.dirname(full), { recursive: true });
			await fs.promises.writeFile(full, new Uint8Array(contents));
		},
		rootDisplay() {
			return expandedRoot;
		},
	};
}

function expandHome(input: string, home: string): string {
	if (input === "~") return home;
	if (input.startsWith("~/")) return `${home}${input.slice(1)}`;
	return input;
}
