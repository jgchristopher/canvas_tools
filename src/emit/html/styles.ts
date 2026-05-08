export const HTML_STYLES = `
:root {
	color-scheme: light dark;
	--ct-bg: #fafafa;
	--ct-surface: #ffffff;
	--ct-border: #d8d8d8;
	--ct-text: #1f2328;
	--ct-muted: #6b7280;
	--ct-accent: #2563eb;
	--ct-edge: #6b7280;
	--ct-group-bg: rgba(0, 0, 0, 0.04);
}
@media (prefers-color-scheme: dark) {
	:root {
		--ct-bg: #16181d;
		--ct-surface: #1f232b;
		--ct-border: #303642;
		--ct-text: #e6e8ec;
		--ct-muted: #9aa0aa;
		--ct-accent: #6aa6ff;
		--ct-edge: #8a93a3;
		--ct-group-bg: rgba(255, 255, 255, 0.04);
	}
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; background: var(--ct-bg); color: var(--ct-text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.ct-viewport { position: fixed; inset: 0; overflow: hidden; cursor: grab; }
.ct-viewport.ct-panning { cursor: grabbing; }
.ct-canvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.ct-edges { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
.ct-edges path { fill: none; stroke: var(--ct-edge); stroke-width: 2; }
.ct-edges .ct-edge-label { fill: var(--ct-text); font-size: 12px; font-family: inherit; paint-order: stroke; stroke: var(--ct-bg); stroke-width: 4; }
.ct-node { position: absolute; background: var(--ct-surface); border: 1px solid var(--ct-border); border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); overflow: hidden; }
.ct-node-text { padding: 12px 14px; }
.ct-node-text > :first-child { margin-top: 0; }
.ct-node-text > :last-child { margin-bottom: 0; }
.ct-node-file { padding: 12px 14px; }
.ct-node-file.ct-image { padding: 0; }
.ct-node-file.ct-image img { width: 100%; height: 100%; display: block; object-fit: contain; background: var(--ct-bg); }
.ct-node-file.ct-missing { display: flex; align-items: center; justify-content: center; color: var(--ct-muted); font-style: italic; }
.ct-node-link { padding: 0; }
.ct-link-card { display: flex; flex-direction: column; height: 100%; text-decoration: none; color: inherit; }
.ct-link-image { width: 100%; height: 50%; object-fit: cover; background: var(--ct-bg); }
.ct-link-body { padding: 10px 12px; flex: 1; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
.ct-link-title { font-weight: 600; }
.ct-link-host { color: var(--ct-muted); font-size: 12px; }
.ct-link-desc { color: var(--ct-muted); font-size: 13px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.ct-node-group { background: var(--ct-group-bg); border: 1px dashed var(--ct-border); border-radius: 12px; }
.ct-group-label { position: absolute; top: 8px; left: 12px; font-size: 12px; color: var(--ct-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.ct-color-1 { border-color: #e34a4a; }
.ct-color-2 { border-color: #d18a3e; }
.ct-color-3 { border-color: #d6c14a; }
.ct-color-4 { border-color: #4cb05a; }
.ct-color-5 { border-color: #4d9bd9; }
.ct-color-6 { border-color: #a06bd9; }
.ct-node h1, .ct-node h2, .ct-node h3, .ct-node h4 { margin: 0.4em 0 0.3em; line-height: 1.25; }
.ct-node p { margin: 0.4em 0; }
.ct-node code { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: rgba(0,0,0,0.06); padding: 0 4px; border-radius: 4px; }
.ct-node pre { background: rgba(0,0,0,0.06); padding: 8px; border-radius: 6px; overflow: auto; }
.ct-node pre code { background: transparent; padding: 0; }
.ct-node ul, .ct-node ol { margin: 0.4em 0; padding-left: 1.4em; }
.ct-node a { color: var(--ct-accent); text-decoration: none; }
.ct-node a:hover { text-decoration: underline; }
.ct-node img { max-width: 100%; height: auto; }
.ct-node blockquote { margin: 0.4em 0; padding-left: 12px; border-left: 3px solid var(--ct-border); color: var(--ct-muted); }
.ct-toolbar { position: fixed; bottom: 16px; right: 16px; display: flex; gap: 4px; background: var(--ct-surface); border: 1px solid var(--ct-border); border-radius: 8px; padding: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); z-index: 10; }
.ct-toolbar button { width: 32px; height: 32px; border: 0; background: transparent; color: var(--ct-text); border-radius: 6px; cursor: pointer; font-size: 16px; }
.ct-toolbar button:hover { background: var(--ct-group-bg); }
.ct-canvas[data-interactive="true"] .ct-node:hover { outline: 1px solid var(--ct-accent); cursor: grab; }
.ct-canvas[data-interactive="true"] .ct-node.ct-dragging { cursor: grabbing; outline: 2px solid var(--ct-accent); }
.ct-handle { position: absolute; width: 10px; height: 10px; background: var(--ct-accent); border: 1px solid var(--ct-bg); border-radius: 2px; opacity: 0; transition: opacity 0.1s; pointer-events: auto; z-index: 2; }
.ct-canvas[data-interactive="true"] .ct-node:hover .ct-handle,
.ct-canvas[data-interactive="true"] .ct-node.ct-dragging .ct-handle { opacity: 1; }
.ct-handle-nw { left: -5px; top: -5px; cursor: nwse-resize; }
.ct-handle-n  { left: calc(50% - 5px); top: -5px; cursor: ns-resize; }
.ct-handle-ne { right: -5px; top: -5px; cursor: nesw-resize; }
.ct-handle-e  { right: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.ct-handle-se { right: -5px; bottom: -5px; cursor: nwse-resize; }
.ct-handle-s  { left: calc(50% - 5px); bottom: -5px; cursor: ns-resize; }
.ct-handle-sw { left: -5px; bottom: -5px; cursor: nesw-resize; }
.ct-handle-w  { left: -5px; top: calc(50% - 5px); cursor: ew-resize; }
.ct-toolbar button[data-act="reset"] { font-size: 12px; padding: 0 8px; width: auto; }
`;
