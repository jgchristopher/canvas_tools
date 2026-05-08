# Canvas Tools

Tools for working with Obsidian Canvas notes. v1 ships two converters:

- **Canvas → HTML**: an interactive, pannable, zoomable HTML page. Drop it into any website, share it as a single self-contained file, or host it as a folder.
- **Canvas → Excalidraw**: convert a `.canvas` to an Obsidian Excalidraw drawing with edges as bound arrows so connections stay attached when you move nodes.

The plugin focuses on canvas export. It does not generate whole-vault sites, override your workspace layout, or talk to the network unless you opt in to link-preview fetching.

## Usage

Three commands appear in the command palette:

- **Canvas Tools: Export current canvas to HTML**
- **Canvas Tools: Export current canvas to Excalidraw**
- **Canvas Tools: Batch export canvases**

The same actions are available on the ribbon icon and on the right-click menu of any `.canvas` file in the file tree.

The export modal lets you pick the target, packaging (single file or folder for HTML), output path, and whether to open the result. Defaults come from the settings tab.

## HTML output

- **Folder mode** writes `index.html` plus `assets/styles.css`, `assets/runtime.js`, and `assets/images/`. Easy to deploy as a sub-site.
- **Single-file mode** inlines CSS, JS, and images as base64 into one `.html` file. Drop-anywhere portable.
- Pan with mouse drag, zoom with the scroll wheel or the bottom-right toolbar. Touch-pinch zoom works on mobile.
- Markdown content (text nodes, embedded notes) is rendered to clean web HTML. No Obsidian-specific class leakage.
- External link cards optionally fetch `og:image` and metadata. Off by default. Enable in settings.

## Excalidraw output

- Each canvas node becomes the matching Excalidraw element at the same coordinates.
- Edges become arrows with `startBinding` / `endBinding` set, so connections stay attached when you move nodes.
- Groups become Excalidraw groups via shared `groupIds`.
- Two output formats: `.excalidraw.md` (Obsidian Excalidraw plugin wrapper, default) or raw `.excalidraw` JSON.

## Reusable API

Other plugins (or Templater scripts) can drive the exporter directly:

```ts
const api = app.plugins.plugins["canvas-tools"].api;
await api.exportCanvasToHtml(file, { packaging: "single-file" });
await api.exportCanvasToExcalidraw(file);
const model = await api.buildModel(file);
```

## Development

```bash
npm install
npm run dev        # watch build
npm run build      # production build
npm test           # vitest unit tests
npm run lint       # eslint with obsidianmd rules
```

For local install, copy `main.js`, `manifest.json`, and `styles.css` into `<Vault>/.obsidian/plugins/canvas-tools/` and enable the plugin in **Settings → Community plugins**.

## Out of scope (v1)

- Whole-vault publishing, sidebars, search, graph view, backlinks panels
- Workspace layout mutation
- Astro / React / framework emitters (planned for a later release)
