import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
	resolve: {
		alias: {
			obsidian: new URL("./test/stubs/obsidian.ts", import.meta.url).pathname,
		},
	},
});
