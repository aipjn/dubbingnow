export class PipelineMetrics {
  private started = performance.now();
  private phases: Record<
    string,
    {
      calls: number;
      totalMs: number;
      maxMs: number;
      first: number;
      last: number;
    }
  > = {};
  private requests: {
    endpoint: string;
    status: number;
    durationMs: number;
    attempt: number;
  }[] = [];
  firstAudioMs: number | null = null;
  private milestones: Record<string, number> = {};
  mark(name: string) {
    this.milestones[name] ??= performance.now() - this.started;
  }
  async measure<T>(phase: string, work: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await work();
    } finally {
      const ms = performance.now() - started;
      const p = (this.phases[phase] ||= {
        calls: 0,
        totalMs: 0,
        maxMs: 0,
        first: started,
        last: started,
      });
      p.calls++;
      p.totalMs += ms;
      p.maxMs = Math.max(p.maxMs, ms);
      p.first = Math.min(p.first, started);
      p.last = Math.max(p.last, started + ms);
    }
  }
  observe = (r: {
    endpoint: string;
    status: number;
    durationMs: number;
    attempt: number;
  }) => {
    this.requests.push(r);
  };
  audioReady() {
    this.firstAudioMs ??= performance.now() - this.started;
  }
  snapshot() {
    const round = (n: number) => Math.round(n * 10) / 10;
    return {
      wallMs: round(performance.now() - this.started),
      milestones: Object.fromEntries(
        Object.entries(this.milestones).map(([name, ms]) => [name, round(ms)]),
      ),
      firstAudioMs:
        this.firstAudioMs === null ? null : round(this.firstAudioMs),
      phases: Object.fromEntries(
        Object.entries(this.phases).map(([name, p]) => [
          name,
          {
            calls: p.calls,
            totalMs: round(p.totalMs),
            maxMs: round(p.maxMs),
            spanMs: round(p.last - p.first),
          },
        ]),
      ),
      requests: this.requests.map((r) => ({
        ...r,
        durationMs: round(r.durationMs),
      })),
    };
  }
}

/** Drain every in-flight task before returning on error, so callers can clean up safely. */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  signal: AbortSignal,
  work: (item: T, index: number, signal: AbortSignal) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new Error("Concurrency must be between 1 and 8.");
  const controller = new AbortController();
  const child = AbortSignal.any([signal, controller.signal]);
  const results: R[] = new Array(items.length);
  let next = 0,
    failed = false,
    error: unknown;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      try {
        while (next < items.length) {
          child.throwIfAborted();
          const index = next++;
          results[index] = await work(items[index], index, child);
        }
      } catch (err) {
        if (!failed) {
          failed = true;
          error = err;
          controller.abort();
        }
      }
    }),
  );
  signal.throwIfAborted();
  if (failed) throw error;
  return results;
}
