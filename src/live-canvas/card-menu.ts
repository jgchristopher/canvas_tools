// Global show/hide state for the canvas card menu (the add-card bar at the
// bottom of every canvas). One instance per plugin; each canvas view
// subscribes and mirrors it.
export class CardMenuVisibility {
	private listeners = new Set<(hidden: boolean) => void>();

	constructor(
		private state: boolean,
		private readonly persist: (hidden: boolean) => Promise<void>,
	) {}

	get hidden(): boolean {
		return this.state;
	}

	// Calls `fn` with the current state immediately, then on every change.
	subscribe(fn: (hidden: boolean) => void): () => void {
		this.listeners.add(fn);
		fn(this.state);
		return () => this.listeners.delete(fn);
	}

	async toggle(): Promise<void> {
		this.state = !this.state;
		for (const fn of this.listeners) fn(this.state);
		await this.persist(this.state);
	}
}
