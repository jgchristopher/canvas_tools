export function shortId(prefix = ""): string {
	const rand = Math.random().toString(36).slice(2, 10);
	return prefix ? `${prefix}-${rand}` : rand;
}

export function safeFileSlug(input: string): string {
	return input
		.replace(/\.canvas$/i, "")
		.replace(/[\\/:*?"<>|]+/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase() || "canvas";
}
