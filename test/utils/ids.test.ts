import { describe, expect, it } from "vitest";
import { safeFileSlug } from "../../src/utils/ids";

describe("safeFileSlug", () => {
	it("strips the .canvas extension", () => {
		expect(safeFileSlug("My Diagram.canvas")).toBe("my-diagram");
	});

	it("replaces unsafe filename characters", () => {
		expect(safeFileSlug("a/b\\c:d*e?f.canvas")).toBe("a-b-c-d-e-f");
	});

	it("collapses runs of separators and lowercases", () => {
		expect(safeFileSlug("  My   Big File  .canvas")).toBe("my-big-file");
	});

	it("falls back to a default slug when the input collapses to nothing", () => {
		expect(safeFileSlug("///.canvas")).toBe("canvas");
	});
});
