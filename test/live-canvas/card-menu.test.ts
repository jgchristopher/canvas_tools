import { describe, expect, it } from "vitest";
import { CardMenuVisibility } from "../../src/live-canvas/card-menu";
import { DEFAULT_SETTINGS } from "../../src/settings";

describe("card menu setting", () => {
	it("defaults to shown", () => {
		expect(DEFAULT_SETTINGS.hideCardMenu).toBe(false);
	});
});

describe("CardMenuVisibility", () => {
	function harness(initial: boolean) {
		const saved: boolean[] = [];
		const vis = new CardMenuVisibility(initial, async (hidden) => {
			saved.push(hidden);
		});
		const seen: boolean[] = [];
		const off = vis.subscribe((hidden) => seen.push(hidden));
		return { vis, saved, seen, off };
	}

	it("tells a new subscriber the current state right away", () => {
		const { seen } = harness(true);
		expect(seen).toEqual([true]);
	});

	it("toggles, persists, and notifies every subscriber", async () => {
		const { vis, saved, seen } = harness(false);
		const other: boolean[] = [];
		vis.subscribe((hidden) => other.push(hidden));
		await vis.toggle();
		expect(vis.hidden).toBe(true);
		expect(saved).toEqual([true]);
		expect(seen).toEqual([false, true]);
		expect(other).toEqual([false, true]);
		await vis.toggle();
		expect(vis.hidden).toBe(false);
		expect(saved).toEqual([true, false]);
	});

	it("stops notifying after unsubscribe", async () => {
		const { vis, seen, off } = harness(false);
		off();
		await vis.toggle();
		expect(seen).toEqual([false]);
	});
});
