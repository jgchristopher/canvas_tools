import type { ExcalidrawDocument } from "./mapping";

// Mirrors the canonical layout that obsidian-excalidraw-plugin writes for new
// blank files when "Compress Excalidraw JSON" is off. Matches the plugin's
// DRAWING_REG parser so files load straight into Excalidraw view.
export function wrapAsObsidianExcalidraw(doc: ExcalidrawDocument): string {
	const json = JSON.stringify(doc);
	const frontmatter = [
		"---",
		"",
		"excalidraw-plugin: parsed",
		"tags: [excalidraw]",
		"",
		"---",
		"==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'",
		"",
		"",
	].join("\n");
	return `${frontmatter}## Drawing\n\`\`\`json\n${json}\n\`\`\`\n%%`;
}
