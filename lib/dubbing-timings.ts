/** Per-attempt browser timings; records no media, filenames, transcript or credentials. */
export class BrowserDubbingTimings {
  private started: number | null = null;
  private phase = "idle";
  private phaseStarted = 0;
  private phases: Record<string, number> = {};
  private resumed = false;
  transition(next: string) {
    const now = performance.now();
    if (this.started === null) {
      if (next === "idle") return null;
      this.started = now;
      this.phaseStarted = now;
      this.phases = {};
      this.resumed = next === "processing" || next === "merging";
    } else {
      this.phases[this.phase] =
        (this.phases[this.phase] || 0) + now - this.phaseStarted;
    }
    this.phase = next;
    this.phaseStarted = now;
    if (next !== "idle") return null;
    const result = {
      totalMs: Math.round(now - this.started),
      resumed: this.resumed,
      phases: Object.fromEntries(
        Object.entries(this.phases).map(([name, ms]) => [name, Math.round(ms)]),
      ),
    };
    this.started = null;
    return result;
  }
}
