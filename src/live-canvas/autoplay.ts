// Injectable so tests can drive it with fake timers.
export interface Clock {
	set(fn: () => void, ms: number): number;
	clear(id: number): void;
}

export const windowClock: Clock = {
	set: (fn, ms) => window.setTimeout(fn, ms),
	clear: (id) => window.clearTimeout(id),
};

// One pending timeout at a time. The session calls start() again after each
// advance, so every slide gets its own duration.
export class Autoplay {
	private timer: number | null = null;

	constructor(
		private readonly clock: Clock,
		private readonly durationMs: (index: number) => number,
		private readonly onAdvance: () => void,
	) {}

	get playing(): boolean {
		return this.timer !== null;
	}

	start(index: number): void {
		this.stop();
		this.timer = this.clock.set(() => {
			this.timer = null;
			this.onAdvance();
		}, this.durationMs(index));
	}

	stop(): void {
		if (this.timer === null) return;
		this.clock.clear(this.timer);
		this.timer = null;
	}
}
