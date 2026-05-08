import { describe, expect, it } from "vitest";
import { HTML_RUNTIME } from "../../../src/emit/html/runtime";

// The runtime is shipped as a JavaScript string embedded into the exported HTML.
// It passes through TWO escape passes: the TS template literal evaluation when
// the plugin loads, and again as a JS source when the browser parses the
// `<script>` block. A regression in either pass produces an unterminated string
// or a stray escape that only fails at browser parse time. This test parses the
// runtime via `new Function` to catch those regressions inside the unit suite.

describe("runtime string", () => {
	it("parses as valid JavaScript", () => {
		expect(() => new Function(HTML_RUNTIME)).not.toThrow();
	});

	it("emits a backslash inside the cssEscape regex callback", () => {
		// The callback should produce a single literal backslash plus the
		// matched character. After both escape passes we expect the runtime
		// string to contain `'\\' + c` — two backslashes plus c, which JS
		// parses as one backslash plus c.
		expect(HTML_RUNTIME).toContain("return '\\\\' + c;");
	});
});
