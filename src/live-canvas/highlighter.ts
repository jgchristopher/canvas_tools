import { Component } from "obsidian";
import type { LiveCanvas } from "./canvas-internals";
import { nodesOnPath } from "./path-model";

const ACTIVE = "ct-path-active";
const EDGE_ON = "ct-path-edge-on";
const EDGE_OFF = "ct-path-edge-off";
const NODE_ON = "ct-path-node-on";
const NODE_OFF = "ct-path-node-off";

// Visual-only highlight: toggles classes on canvas DOM elements and never
// touches canvas data, so nothing can be saved into the .canvas file.
export class Highlighter extends Component {
	private edgeIds: ReadonlySet<string> | null = null;
	private observer: MutationObserver | null = null;
	private frame = 0;

	constructor(private readonly canvas: LiveCanvas) {
		super();
	}

	onload(): void {
		// The canvas attaches and detaches elements as they scroll in and out
		// of view, and creates new ones on edits. Re-apply once per frame.
		this.observer = new MutationObserver(() => this.schedule());
		this.observer.observe(this.canvas.observeEl, { childList: true, subtree: true });
	}

	onunload(): void {
		this.observer?.disconnect();
		this.observer = null;
		if (this.frame) window.cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.clear();
	}

	show(edgeIds: ReadonlySet<string>): void {
		this.edgeIds = edgeIds;
		this.apply();
	}

	clear(): void {
		this.edgeIds = null;
		this.canvas.root.removeClass(ACTIVE);
		for (const edge of this.canvas.edges()) {
			for (const el of edge.els) el.removeClass(EDGE_ON, EDGE_OFF);
		}
		for (const node of this.canvas.nodes()) node.el.removeClass(NODE_ON, NODE_OFF);
	}

	private schedule(): void {
		if (!this.edgeIds || this.frame) return;
		this.frame = window.requestAnimationFrame(() => {
			this.frame = 0;
			this.apply();
		});
	}

	private apply(): void {
		const ids = this.edgeIds;
		if (!ids) return;
		const edges = this.canvas.edges();
		const onNodes = nodesOnPath(edges, ids);
		this.canvas.root.addClass(ACTIVE);
		for (const edge of edges) {
			const on = ids.has(edge.id);
			for (const el of edge.els) {
				el.toggleClass(EDGE_ON, on);
				el.toggleClass(EDGE_OFF, !on);
			}
		}
		for (const node of this.canvas.nodes()) {
			const on = onNodes.has(node.id);
			node.el.toggleClass(NODE_ON, on);
			node.el.toggleClass(NODE_OFF, !on);
		}
	}
}
