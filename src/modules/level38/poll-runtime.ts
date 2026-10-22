import { Level38Service, Level38State } from "./service";

// One active-poll timer, independent of App Access Token / EventSub health.
// State broadcasts must not postpone an already scheduled Helix recovery read.
export class PollRuntime {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wakeAt = 0;
  private stopped = false;
  private started = false;
  private revision = -1;
  private failures = 0;
  private pending: Promise<void> | null = null;
  private queuedWake = false;

  constructor(private readonly service: Level38Service) {}

  start(): void { if (this.started || this.stopped) return; this.started = true; this.wake(); }

  update(state: Level38State): void {
    if (this.stopped || state.event.revision < this.revision) return;
    this.revision = state.event.revision;
    const active = state.polls.some((poll) => poll.source === "TWITCH" && !poll.cancelledAt &&
      (poll.status === "OPEN" || ["PREPARING", "CREATING", "CLOSING", "CANCELLING"].includes(poll.nativeStatus ?? "")));
    if (active) this.schedule(5000);
    else { if (this.timer) clearTimeout(this.timer); this.timer = null; this.wakeAt = 0; }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    const wakeAt = Date.now() + Math.min(delayMs, 2147483647);
    if (this.timer && this.wakeAt <= wakeAt) return;
    if (this.timer) clearTimeout(this.timer);
    this.wakeAt = wakeAt;
    this.timer = setTimeout(() => { this.timer = null; this.wakeAt = 0; this.wake(); }, Math.min(delayMs, 2147483647));
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
