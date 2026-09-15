// Public protocol, reusable by a future overlay. No operator/quest/participant metadata.
export interface UnlockEvent {
  version: 1;
  id: string;
  sequence: number;
  revision: number;
  occurredAt: string;
  completed: number;
  target: number;
  startsAt: number;
  durationMs: number;
}

export function unlockEvent(sequence: number, revision: number, occurredAt: Date, completed: number, target: number): UnlockEvent {
  return { version: 1, id: `level38:unlock:${sequence}`, sequence, revision, occurredAt: occurredAt.toISOString(),
    completed, target, startsAt: Date.now() + 400, durationMs: 6500 };
}

// Preview has no durable sequence, revision or completed-count claim.
export interface PreviewEvent { version: 1; id: string; startsAt: number; durationMs: number; target: number }
