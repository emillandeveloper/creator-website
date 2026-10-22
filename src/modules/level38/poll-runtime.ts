import { Level38Service, Level38State } from "./service";

// One deadline timer, no per-second database polling. Every local state change
// replaces it; persisted deadlines are re-read on startup and after a wake-up.
export class PollRuntime {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private revision = -1;
  private failures = 0;
  private pending: Promise<void> | null = null;
  private queuedWake = false;

  constructor(private readonly service: Level38Service) {}

  start(): void { this.wake(); }

  update(state: Level38State): void {
    if (this.stopped || state.event.revision < this.revision) return;
    this.revision = state.event.revision;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const deadlines = state.polls.filter((poll) => poll.source === "TWITCH" && poll.status === "OPEN" && !poll.cancelledAt && poll.endsAt)
      .map((poll) => Date.parse(poll.endsAt!)).filter(Number.isFinite);
    if (deadlines.length) this.schedule(Math.max(15000, Math.min(...deadlines) - Date.now()));
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => { this.timer = null; this.wake(); }, Math.min(delayMs, 2147483647));
    this.timer.unref?.();
  }

  private wake(): void {
    if (this.stopped) return;
    if (this.pending) { this.queuedWake = true; return; }
    this.pending = this.service.expirePolls().then((state) => {
      this.failures = 0;
      this.update(state);
    }).catch(() => {
      // Never log database errors: they may include credentials. Backoff is
      // capped at a minute, so transient startup failures recover safely.
      console.error("LEVEL 38 poll timer temporarily unavailable.");
      this.failures += 1;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.schedule(Math.min(60000, 1000 * 2 ** Math.min(this.failures, 6)));
    }).finally(() => {
      this.pending = null;
      if (this.queuedWake && !this.stopped) {
        this.queuedWake = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.schedule(0);
      }
    });
  }

  async close(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.pending;
  }
}
