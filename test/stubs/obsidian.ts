// Minimal stubs for the parts of `obsidian` referenced by code paths exercised
// in unit tests. Tests load only pure modules (excalidraw mapping, slug utils,
// renderer, edge inference); these stubs exist so the module graph type-checks
// without pulling in the real Obsidian runtime.

export class TFile {
	path = "";
	name = "";
	basename = "";
	extension = "";
}

export class Component {
	load(): void {}
	unload(): void {}
}

export const MarkdownRenderer = {
	render: async (): Promise<void> => {
		// not exercised by unit tests
	},
};

export const Notice: unknown = class {};
export const Modal: unknown = class {};
export const Setting: unknown = class {};
export const PluginSettingTab: unknown = class {};
export const Plugin: unknown = class {};
export const requestUrl = async (): Promise<{ status: number; text: string; arrayBuffer: ArrayBuffer; headers: Record<string, string> }> => {
	throw new Error("requestUrl not stubbed in tests");
};

export type App = unknown;
export type TAbstractFile = unknown;
